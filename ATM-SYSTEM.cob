      *> ================================================================
      *> ATM-SYSTEM: COBOL ATM Banking Engine
      *> Accepts commands via ACCEPT (stdin), returns pipe-delimited
      *> responses via DISPLAY (stdout).
      *> Compile: cobc -x -free ATM-SYSTEM.cob -o atm-system
      *> ================================================================
       IDENTIFICATION DIVISION.
       PROGRAM-ID. ATM-SYSTEM.

       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT ACCOUNT-FILE ASSIGN TO "ACCOUNTS.DAT"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-ACCT-FS.
           SELECT TRAN-FILE ASSIGN TO "TRANSLOG.DAT"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-TRAN-FS.
           SELECT AUDIT-FILE ASSIGN TO "AUDITLOG.DAT"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-AUDIT-FS.

       DATA DIVISION.
       FILE SECTION.

       FD ACCOUNT-FILE.
       01 ACCT-REC.
           05 AR-NUMBER        PIC X(10).
           05 AR-PIN           PIC X(4).
           05 AR-FIRST         PIC X(20).
           05 AR-LAST          PIC X(20).
           05 AR-TYPE          PIC X(1).
           05 AR-BALANCE       PIC S9(9)V99.
           05 AR-STATUS        PIC X(1).
           05 AR-DAILY-WD      PIC S9(7)V99.
           05 AR-LAST-WD-DATE  PIC X(8).
           05 AR-FAIL-PINS     PIC 99.
           05 AR-ADMIN         PIC X(1).

       FD TRAN-FILE.
       01 TRAN-REC.
           05 TR-DATE          PIC X(8).
           05 TR-TIME          PIC X(6).
           05 TR-ACCT          PIC X(10).
           05 TR-TYPE          PIC X(10).
           05 TR-AMOUNT        PIC S9(9)V99.
           05 TR-BALANCE       PIC S9(9)V99.
           05 TR-DESC          PIC X(30).

       FD AUDIT-FILE.
       01 AUDIT-REC.
           05 AL-DATE          PIC X(8).
           05 AL-TIME          PIC X(6).
           05 AL-ACCT          PIC X(10).
           05 AL-ACTION        PIC X(20).
           05 AL-DETAIL        PIC X(40).

       WORKING-STORAGE SECTION.
       01 WS-ACCT-FS           PIC XX.
       01 WS-TRAN-FS           PIC XX.
       01 WS-AUDIT-FS          PIC XX.
       01 WS-EOF               PIC X VALUE "N".

       01 WS-COMMAND            PIC X(200).
       01 WS-OP                 PIC X(20).
       01 WS-P1                 PIC X(20).
       01 WS-P2                 PIC X(20).
       01 WS-P3                 PIC X(20).

      *> In-memory account table (max 100 accounts)
       01 WS-ACCT-TBL.
           05 WS-NUM-ACCTS     PIC 99 VALUE 0.
           05 WS-ACCT OCCURS 100 TIMES.
               10 WA-NUMBER    PIC X(10).
               10 WA-PIN       PIC X(4).
               10 WA-FIRST     PIC X(20).
               10 WA-LAST      PIC X(20).
               10 WA-TYPE      PIC X(1).
               10 WA-BALANCE   PIC S9(9)V99.
               10 WA-STATUS    PIC X(1).
               10 WA-DAILY-WD  PIC S9(7)V99.
               10 WA-WD-DATE   PIC X(8).
               10 WA-FAILS     PIC 99.
               10 WA-ADMIN     PIC X(1).

       01 WS-I                  PIC 99.
       01 WS-FI                 PIC 99 VALUE 0.
       01 WS-FI2                PIC 99 VALUE 0.
       01 WS-FOUND              PIC X VALUE "N".

       01 WS-AMT                PIC S9(9)V99 VALUE 0.
       01 WS-BAL-DSP            PIC -(9)9.99.
       01 WS-AMT-DSP            PIC -(9)9.99.

       01 WS-DATE-TIME.
           05 WS-DT-DATE       PIC X(8).
           05 WS-DT-TIME       PIC X(8).
           05 WS-DT-GMT        PIC X(5).
       01 WS-TODAY              PIC X(8).
       01 WS-NOW-TIME           PIC X(6).

       01 WS-TYPE-NAME          PIC X(10).
       01 WS-REMAIN             PIC 9.
       01 WS-NEW-DAILY          PIC S9(7)V99.

      *> Mini-statement circular buffer (last 5)
       01 WS-STMT-BUF.
           05 WS-STMT-CT        PIC 99 VALUE 0.
           05 WS-STMT OCCURS 5 TIMES.
               10 WS-S-DATE    PIC X(8).
               10 WS-S-TIME    PIC X(6).
               10 WS-S-TYPE    PIC X(10).
               10 WS-S-AMT     PIC S9(9)V99.
               10 WS-S-BAL     PIC S9(9)V99.
               10 WS-S-DESC    PIC X(30).
       01 WS-SI                 PIC 99.

      *> Logging fields
       01 WS-LOG-ACCT           PIC X(10).
       01 WS-LOG-TYPE           PIC X(10).
       01 WS-LOG-AMT            PIC S9(9)V99.
       01 WS-LOG-BAL            PIC S9(9)V99.
       01 WS-LOG-DESC           PIC X(30).
       01 WS-AUD-ACCT           PIC X(10).
       01 WS-AUD-ACTION         PIC X(20).
       01 WS-AUD-DETAIL         PIC X(40).

       PROCEDURE DIVISION.
       MAIN-PARA.
           ACCEPT WS-COMMAND
           PERFORM GET-DATETIME
           PERFORM PARSE-COMMAND

           EVALUATE WS-OP
               WHEN "CHECK-PIN"  PERFORM DO-CHECK-PIN
               WHEN "BALANCE"    PERFORM DO-BALANCE
               WHEN "WITHDRAW"   PERFORM DO-WITHDRAW
               WHEN "DEPOSIT"    PERFORM DO-DEPOSIT
               WHEN "TRANSFER"   PERFORM DO-TRANSFER
               WHEN "MINI-STMT"  PERFORM DO-MINI-STMT
               WHEN "CHANGE-PIN" PERFORM DO-CHANGE-PIN
               WHEN OTHER
                   DISPLAY "ERR|INVALID-OP|Unknown operation"
           END-EVALUATE
           STOP RUN.

       GET-DATETIME.
           MOVE FUNCTION CURRENT-DATE TO WS-DATE-TIME
           MOVE WS-DT-DATE TO WS-TODAY
           MOVE WS-DT-TIME(1:6) TO WS-NOW-TIME.

       PARSE-COMMAND.
           INITIALIZE WS-OP WS-P1 WS-P2 WS-P3
           UNSTRING WS-COMMAND DELIMITED BY ALL SPACES
               INTO WS-OP WS-P1 WS-P2 WS-P3
           END-UNSTRING
           MOVE FUNCTION UPPER-CASE(WS-OP) TO WS-OP.

       LOAD-ACCOUNTS.
           MOVE 0 TO WS-NUM-ACCTS
           MOVE "N" TO WS-EOF
           OPEN INPUT ACCOUNT-FILE
           IF WS-ACCT-FS NOT = "00"
               DISPLAY "ERR|FILE-ERR|Cannot open accounts file"
               STOP RUN
           END-IF
           PERFORM UNTIL WS-EOF = "Y"
               READ ACCOUNT-FILE
                   AT END
                       MOVE "Y" TO WS-EOF
                   NOT AT END
                       ADD 1 TO WS-NUM-ACCTS
                       MOVE AR-NUMBER   TO WA-NUMBER(WS-NUM-ACCTS)
                       MOVE AR-PIN      TO WA-PIN(WS-NUM-ACCTS)
                       MOVE AR-FIRST    TO WA-FIRST(WS-NUM-ACCTS)
                       MOVE AR-LAST     TO WA-LAST(WS-NUM-ACCTS)
                       MOVE AR-TYPE     TO WA-TYPE(WS-NUM-ACCTS)
                       MOVE AR-BALANCE  TO WA-BALANCE(WS-NUM-ACCTS)
                       MOVE AR-STATUS   TO WA-STATUS(WS-NUM-ACCTS)
                       MOVE AR-DAILY-WD TO WA-DAILY-WD(WS-NUM-ACCTS)
                       MOVE AR-LAST-WD-DATE
                                        TO WA-WD-DATE(WS-NUM-ACCTS)
                       MOVE AR-FAIL-PINS
                                        TO WA-FAILS(WS-NUM-ACCTS)
                       MOVE AR-ADMIN    TO WA-ADMIN(WS-NUM-ACCTS)
               END-READ
           END-PERFORM
           CLOSE ACCOUNT-FILE.

       SAVE-ACCOUNTS.
           OPEN OUTPUT ACCOUNT-FILE
           PERFORM VARYING WS-I FROM 1 BY 1
               UNTIL WS-I > WS-NUM-ACCTS
               MOVE WA-NUMBER(WS-I)   TO AR-NUMBER
               MOVE WA-PIN(WS-I)      TO AR-PIN
               MOVE WA-FIRST(WS-I)    TO AR-FIRST
               MOVE WA-LAST(WS-I)     TO AR-LAST
               MOVE WA-TYPE(WS-I)     TO AR-TYPE
               MOVE WA-BALANCE(WS-I)  TO AR-BALANCE
               MOVE WA-STATUS(WS-I)   TO AR-STATUS
               MOVE WA-DAILY-WD(WS-I) TO AR-DAILY-WD
               MOVE WA-WD-DATE(WS-I)  TO AR-LAST-WD-DATE
               MOVE WA-FAILS(WS-I)    TO AR-FAIL-PINS
               MOVE WA-ADMIN(WS-I)    TO AR-ADMIN
               WRITE ACCT-REC
           END-PERFORM
           CLOSE ACCOUNT-FILE.

       FIND-ACCOUNT.
           MOVE "N" TO WS-FOUND
           MOVE 0 TO WS-FI
           PERFORM VARYING WS-I FROM 1 BY 1
               UNTIL WS-I > WS-NUM-ACCTS OR WS-FOUND = "Y"
               IF WA-NUMBER(WS-I) = WS-P1
                   MOVE "Y" TO WS-FOUND
                   MOVE WS-I TO WS-FI
               END-IF
           END-PERFORM.

      *> ============================================================
      *> CHECK-PIN: Validate account + PIN
      *> Input:  P1=account P2=pin
      *> Output: OK|name|type  or  ERR|code|message
      *> ============================================================
       DO-CHECK-PIN.
           PERFORM LOAD-ACCOUNTS
           PERFORM FIND-ACCOUNT
           IF WS-FOUND = "N"
               DISPLAY "ERR|ACCT-NOT-FOUND|Account not found"
               EXIT PARAGRAPH
           END-IF

           IF WA-STATUS(WS-FI) = "L"
               DISPLAY "ERR|ACCT-LOCKED|Account is locked"
               MOVE WS-P1 TO WS-AUD-ACCT
               MOVE "LOGIN-LOCKED" TO WS-AUD-ACTION
               MOVE "Attempt on locked account" TO WS-AUD-DETAIL
               PERFORM LOG-AUDIT
               EXIT PARAGRAPH
           END-IF

           IF WA-PIN(WS-FI) = WS-P2
               MOVE 0 TO WA-FAILS(WS-FI)
               PERFORM SAVE-ACCOUNTS

               IF WA-TYPE(WS-FI) = "C"
                   MOVE "Checking" TO WS-TYPE-NAME
               ELSE
                   MOVE "Savings" TO WS-TYPE-NAME
               END-IF

               DISPLAY "OK|"
                   FUNCTION TRIM(WA-FIRST(WS-FI))
                   " "
                   FUNCTION TRIM(WA-LAST(WS-FI))
                   "|"
                   FUNCTION TRIM(WS-TYPE-NAME)

               MOVE WS-P1 TO WS-AUD-ACCT
               MOVE "LOGIN-OK" TO WS-AUD-ACTION
               MOVE "PIN verified" TO WS-AUD-DETAIL
               PERFORM LOG-AUDIT
           ELSE
               ADD 1 TO WA-FAILS(WS-FI)
               IF WA-FAILS(WS-FI) >= 3
                   MOVE "L" TO WA-STATUS(WS-FI)
                   PERFORM SAVE-ACCOUNTS
                   DISPLAY "ERR|ACCT-LOCKED|"
                       "Account locked after 3 failed attempts"
                   MOVE WS-P1 TO WS-AUD-ACCT
                   MOVE "ACCT-LOCKED" TO WS-AUD-ACTION
                   MOVE "3 failed PIN attempts" TO WS-AUD-DETAIL
                   PERFORM LOG-AUDIT
               ELSE
                   PERFORM SAVE-ACCOUNTS
                   COMPUTE WS-REMAIN = 3 - WA-FAILS(WS-FI)
                   DISPLAY "ERR|INVALID-PIN|Wrong PIN. "
                       WS-REMAIN " attempts remaining"
                   MOVE WS-P1 TO WS-AUD-ACCT
                   MOVE "LOGIN-FAIL" TO WS-AUD-ACTION
                   MOVE "Invalid PIN entered" TO WS-AUD-DETAIL
                   PERFORM LOG-AUDIT
               END-IF
           END-IF.

      *> ============================================================
      *> BALANCE: Return account balance
      *> Input:  P1=account
      *> Output: OK|balance|type
      *> ============================================================
       DO-BALANCE.
           PERFORM LOAD-ACCOUNTS
           PERFORM FIND-ACCOUNT
           IF WS-FOUND = "N"
               DISPLAY "ERR|ACCT-NOT-FOUND|Account not found"
               EXIT PARAGRAPH
           END-IF

           MOVE WA-BALANCE(WS-FI) TO WS-BAL-DSP
           IF WA-TYPE(WS-FI) = "C"
               MOVE "Checking" TO WS-TYPE-NAME
           ELSE
               MOVE "Savings" TO WS-TYPE-NAME
           END-IF

           DISPLAY "OK|"
               FUNCTION TRIM(WS-BAL-DSP)
               "|"
               FUNCTION TRIM(WS-TYPE-NAME).

      *> ============================================================
      *> WITHDRAW: Deduct from balance with daily limit
      *> Input:  P1=account P2=amount
      *> Output: OK|amount|new-balance
      *> ============================================================
       DO-WITHDRAW.
           PERFORM LOAD-ACCOUNTS
           PERFORM FIND-ACCOUNT
           IF WS-FOUND = "N"
               DISPLAY "ERR|ACCT-NOT-FOUND|Account not found"
               EXIT PARAGRAPH
           END-IF

           COMPUTE WS-AMT = FUNCTION NUMVAL(WS-P2)
           IF WS-AMT <= 0
               DISPLAY "ERR|INVALID-AMT|Invalid amount"
               EXIT PARAGRAPH
           END-IF

           IF WS-AMT > WA-BALANCE(WS-FI)
               DISPLAY "ERR|INSUFF-FUNDS|Insufficient funds"
               EXIT PARAGRAPH
           END-IF

      *>   Check daily withdrawal limit ($500)
           IF WA-WD-DATE(WS-FI) = WS-TODAY
               COMPUTE WS-NEW-DAILY =
                   WA-DAILY-WD(WS-FI) + WS-AMT
           ELSE
               MOVE WS-AMT TO WS-NEW-DAILY
           END-IF

           IF WS-NEW-DAILY > 500.00
               DISPLAY "ERR|DAILY-LIMIT|"
                   "500 daily withdrawal limit exceeded"
               EXIT PARAGRAPH
           END-IF

           SUBTRACT WS-AMT FROM WA-BALANCE(WS-FI)
           MOVE WS-NEW-DAILY TO WA-DAILY-WD(WS-FI)
           MOVE WS-TODAY TO WA-WD-DATE(WS-FI)
           PERFORM SAVE-ACCOUNTS

           MOVE WS-AMT TO WS-AMT-DSP
           MOVE WA-BALANCE(WS-FI) TO WS-BAL-DSP
           DISPLAY "OK|"
               FUNCTION TRIM(WS-AMT-DSP)
               "|"
               FUNCTION TRIM(WS-BAL-DSP)

           MOVE WS-P1 TO WS-LOG-ACCT
           MOVE "WITHDRAWAL" TO WS-LOG-TYPE
           MOVE WS-AMT TO WS-LOG-AMT
           MOVE WA-BALANCE(WS-FI) TO WS-LOG-BAL
           MOVE "ATM Withdrawal" TO WS-LOG-DESC
           PERFORM LOG-TRANSACTION

           MOVE WS-P1 TO WS-AUD-ACCT
           MOVE "WITHDRAWAL" TO WS-AUD-ACTION
           MOVE WS-AMT TO WS-AMT-DSP
           STRING "Amount: $" FUNCTION TRIM(WS-AMT-DSP)
               DELIMITED BY SIZE INTO WS-AUD-DETAIL
           END-STRING
           PERFORM LOG-AUDIT.

      *> ============================================================
      *> DEPOSIT: Add to balance
      *> Input:  P1=account P2=amount
      *> Output: OK|amount|new-balance
      *> ============================================================
       DO-DEPOSIT.
           PERFORM LOAD-ACCOUNTS
           PERFORM FIND-ACCOUNT
           IF WS-FOUND = "N"
               DISPLAY "ERR|ACCT-NOT-FOUND|Account not found"
               EXIT PARAGRAPH
           END-IF

           COMPUTE WS-AMT = FUNCTION NUMVAL(WS-P2)
           IF WS-AMT <= 0
               DISPLAY "ERR|INVALID-AMT|Invalid amount"
               EXIT PARAGRAPH
           END-IF

           ADD WS-AMT TO WA-BALANCE(WS-FI)
           PERFORM SAVE-ACCOUNTS

           MOVE WS-AMT TO WS-AMT-DSP
           MOVE WA-BALANCE(WS-FI) TO WS-BAL-DSP
           DISPLAY "OK|"
               FUNCTION TRIM(WS-AMT-DSP)
               "|"
               FUNCTION TRIM(WS-BAL-DSP)

           MOVE WS-P1 TO WS-LOG-ACCT
           MOVE "DEPOSIT" TO WS-LOG-TYPE
           MOVE WS-AMT TO WS-LOG-AMT
           MOVE WA-BALANCE(WS-FI) TO WS-LOG-BAL
           MOVE "ATM Deposit" TO WS-LOG-DESC
           PERFORM LOG-TRANSACTION

           MOVE WS-P1 TO WS-AUD-ACCT
           MOVE "DEPOSIT" TO WS-AUD-ACTION
           MOVE WS-AMT TO WS-AMT-DSP
           STRING "Amount: $" FUNCTION TRIM(WS-AMT-DSP)
               DELIMITED BY SIZE INTO WS-AUD-DETAIL
           END-STRING
           PERFORM LOG-AUDIT.

      *> ============================================================
      *> TRANSFER: Move funds between accounts
      *> Input:  P1=source P2=destination P3=amount
      *> Output: OK|amount|source-balance
      *> ============================================================
       DO-TRANSFER.
           PERFORM LOAD-ACCOUNTS

      *>   Find source account
           PERFORM FIND-ACCOUNT
           IF WS-FOUND = "N"
               DISPLAY "ERR|ACCT-NOT-FOUND|Source account not found"
               EXIT PARAGRAPH
           END-IF

      *>   Find destination account
           MOVE "N" TO WS-FOUND
           MOVE 0 TO WS-FI2
           PERFORM VARYING WS-I FROM 1 BY 1
               UNTIL WS-I > WS-NUM-ACCTS OR WS-FOUND = "Y"
               IF WA-NUMBER(WS-I) = WS-P2
                   MOVE "Y" TO WS-FOUND
                   MOVE WS-I TO WS-FI2
               END-IF
           END-PERFORM

           IF WS-FOUND = "N"
               DISPLAY "ERR|ACCT-NOT-FOUND|"
                   "Destination account not found"
               EXIT PARAGRAPH
           END-IF

           COMPUTE WS-AMT = FUNCTION NUMVAL(WS-P3)
           IF WS-AMT <= 0
               DISPLAY "ERR|INVALID-AMT|Invalid amount"
               EXIT PARAGRAPH
           END-IF

           IF WS-AMT > WA-BALANCE(WS-FI)
               DISPLAY "ERR|INSUFF-FUNDS|Insufficient funds"
               EXIT PARAGRAPH
           END-IF

           SUBTRACT WS-AMT FROM WA-BALANCE(WS-FI)
           ADD WS-AMT TO WA-BALANCE(WS-FI2)
           PERFORM SAVE-ACCOUNTS

           MOVE WS-AMT TO WS-AMT-DSP
           MOVE WA-BALANCE(WS-FI) TO WS-BAL-DSP
           DISPLAY "OK|"
               FUNCTION TRIM(WS-AMT-DSP)
               "|"
               FUNCTION TRIM(WS-BAL-DSP)

      *>   Log for source account
           MOVE WS-P1 TO WS-LOG-ACCT
           MOVE "TRANSFER" TO WS-LOG-TYPE
           MOVE WS-AMT TO WS-LOG-AMT
           MOVE WA-BALANCE(WS-FI) TO WS-LOG-BAL
           INITIALIZE WS-LOG-DESC
           STRING "Transfer to " FUNCTION TRIM(WS-P2)
               DELIMITED BY SIZE INTO WS-LOG-DESC
           END-STRING
           PERFORM LOG-TRANSACTION

      *>   Log for destination account
           MOVE WS-P2 TO WS-LOG-ACCT
           MOVE "TRANSFER" TO WS-LOG-TYPE
           MOVE WS-AMT TO WS-LOG-AMT
           MOVE WA-BALANCE(WS-FI2) TO WS-LOG-BAL
           INITIALIZE WS-LOG-DESC
           STRING "Transfer from " FUNCTION TRIM(WS-P1)
               DELIMITED BY SIZE INTO WS-LOG-DESC
           END-STRING
           PERFORM LOG-TRANSACTION

           MOVE WS-P1 TO WS-AUD-ACCT
           MOVE "TRANSFER" TO WS-AUD-ACTION
           MOVE WS-AMT TO WS-AMT-DSP
           INITIALIZE WS-AUD-DETAIL
           STRING "To " FUNCTION TRIM(WS-P2)
               " $" FUNCTION TRIM(WS-AMT-DSP)
               DELIMITED BY SIZE INTO WS-AUD-DETAIL
           END-STRING
           PERFORM LOG-AUDIT.

      *> ============================================================
      *> MINI-STMT: Return last 5 transactions for account
      *> Input:  P1=account
      *> Output: OK|count then one line per transaction
      *> ============================================================
       DO-MINI-STMT.
           MOVE 0 TO WS-STMT-CT
           MOVE "N" TO WS-EOF
           OPEN INPUT TRAN-FILE
           IF WS-TRAN-FS NOT = "00"
               DISPLAY "OK|0"
               EXIT PARAGRAPH
           END-IF

           PERFORM UNTIL WS-EOF = "Y"
               READ TRAN-FILE
                   AT END
                       MOVE "Y" TO WS-EOF
                   NOT AT END
                       IF TR-ACCT = WS-P1
                           IF WS-STMT-CT < 5
                               ADD 1 TO WS-STMT-CT
                           ELSE
                               PERFORM VARYING WS-SI
                                   FROM 1 BY 1
                                   UNTIL WS-SI > 4
                                   MOVE WS-STMT(WS-SI + 1)
                                       TO WS-STMT(WS-SI)
                               END-PERFORM
                           END-IF
                           MOVE TR-DATE
                               TO WS-S-DATE(WS-STMT-CT)
                           MOVE TR-TIME
                               TO WS-S-TIME(WS-STMT-CT)
                           MOVE TR-TYPE
                               TO WS-S-TYPE(WS-STMT-CT)
                           MOVE TR-AMOUNT
                               TO WS-S-AMT(WS-STMT-CT)
                           MOVE TR-BALANCE
                               TO WS-S-BAL(WS-STMT-CT)
                           MOVE TR-DESC
                               TO WS-S-DESC(WS-STMT-CT)
                       END-IF
               END-READ
           END-PERFORM
           CLOSE TRAN-FILE

           DISPLAY "OK|" WS-STMT-CT
           PERFORM VARYING WS-SI FROM 1 BY 1
               UNTIL WS-SI > WS-STMT-CT
               MOVE WS-S-AMT(WS-SI) TO WS-AMT-DSP
               MOVE WS-S-BAL(WS-SI) TO WS-BAL-DSP
               DISPLAY
                   WS-S-DATE(WS-SI) "|"
                   FUNCTION TRIM(WS-S-TYPE(WS-SI)) "|"
                   FUNCTION TRIM(WS-AMT-DSP) "|"
                   FUNCTION TRIM(WS-BAL-DSP) "|"
                   FUNCTION TRIM(WS-S-DESC(WS-SI))
           END-PERFORM.

      *> ============================================================
      *> CHANGE-PIN: Update account PIN
      *> Input:  P1=account P2=old-pin P3=new-pin
      *> Output: OK|message
      *> ============================================================
       DO-CHANGE-PIN.
           PERFORM LOAD-ACCOUNTS
           PERFORM FIND-ACCOUNT
           IF WS-FOUND = "N"
               DISPLAY "ERR|ACCT-NOT-FOUND|Account not found"
               EXIT PARAGRAPH
           END-IF

           IF WA-PIN(WS-FI) NOT = WS-P2
               DISPLAY "ERR|INVALID-PIN|Current PIN is incorrect"
               EXIT PARAGRAPH
           END-IF

           MOVE WS-P3(1:4) TO WA-PIN(WS-FI)
           PERFORM SAVE-ACCOUNTS

           DISPLAY "OK|PIN changed successfully"

           MOVE WS-P1 TO WS-AUD-ACCT
           MOVE "PIN-CHANGE" TO WS-AUD-ACTION
           MOVE "PIN changed" TO WS-AUD-DETAIL
           PERFORM LOG-AUDIT.

      *> ============================================================
      *> LOG-TRANSACTION: Append to TRANSLOG.DAT
      *> ============================================================
       LOG-TRANSACTION.
           OPEN EXTEND TRAN-FILE
           IF WS-TRAN-FS NOT = "00"
               OPEN OUTPUT TRAN-FILE
           END-IF
           MOVE WS-TODAY     TO TR-DATE
           MOVE WS-NOW-TIME  TO TR-TIME
           MOVE WS-LOG-ACCT  TO TR-ACCT
           MOVE WS-LOG-TYPE  TO TR-TYPE
           MOVE WS-LOG-AMT   TO TR-AMOUNT
           MOVE WS-LOG-BAL   TO TR-BALANCE
           MOVE WS-LOG-DESC  TO TR-DESC
           WRITE TRAN-REC
           CLOSE TRAN-FILE.

      *> ============================================================
      *> LOG-AUDIT: Append to AUDITLOG.DAT
      *> ============================================================
       LOG-AUDIT.
           OPEN EXTEND AUDIT-FILE
           IF WS-AUDIT-FS NOT = "00"
               OPEN OUTPUT AUDIT-FILE
           END-IF
           MOVE WS-TODAY     TO AL-DATE
           MOVE WS-NOW-TIME  TO AL-TIME
           MOVE WS-AUD-ACCT  TO AL-ACCT
           MOVE WS-AUD-ACTION TO AL-ACTION
           MOVE WS-AUD-DETAIL TO AL-DETAIL
           WRITE AUDIT-REC
           CLOSE AUDIT-FILE.
