      *> ================================================================
      *> SETUP-DATA: Creates sample account data for the ATM system.
      *> Compile: cobc -x -free SETUP-DATA.cob -o setup-data
      *> ================================================================
       IDENTIFICATION DIVISION.
       PROGRAM-ID. SETUP-DATA.

       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT ACCOUNT-FILE ASSIGN TO "ACCOUNTS.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
           SELECT TRAN-FILE ASSIGN TO "TRANSLOG.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
           SELECT AUDIT-FILE ASSIGN TO "AUDITLOG.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.

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
       01 TRAN-REC             PIC X(1).
       FD AUDIT-FILE.
       01 AUDIT-REC            PIC X(1).

       PROCEDURE DIVISION.
       MAIN-PARA.
      *>   Create account file with sample customers
           OPEN OUTPUT ACCOUNT-FILE

      *>   Customer 1: John Smith - Checking - $5,250.75
           MOVE "1000000001" TO AR-NUMBER
           MOVE "1234"       TO AR-PIN
           MOVE "John"       TO AR-FIRST
           MOVE "Smith"      TO AR-LAST
           MOVE "C"          TO AR-TYPE
           MOVE 5250.75      TO AR-BALANCE
           MOVE "A"          TO AR-STATUS
           MOVE 0            TO AR-DAILY-WD
           MOVE "00000000"   TO AR-LAST-WD-DATE
           MOVE 0            TO AR-FAIL-PINS
           MOVE "N"          TO AR-ADMIN
           WRITE ACCT-REC

      *>   Customer 2: Sarah Jones - Savings - $12,830.50
           MOVE "1000000002" TO AR-NUMBER
           MOVE "5678"       TO AR-PIN
           MOVE "Sarah"      TO AR-FIRST
           MOVE "Jones"      TO AR-LAST
           MOVE "S"          TO AR-TYPE
           MOVE 12830.50     TO AR-BALANCE
           MOVE "A"          TO AR-STATUS
           MOVE 0            TO AR-DAILY-WD
           MOVE "00000000"   TO AR-LAST-WD-DATE
           MOVE 0            TO AR-FAIL-PINS
           MOVE "N"          TO AR-ADMIN
           WRITE ACCT-REC

      *>   Customer 3: Mike Wilson - Checking - $890.25
           MOVE "1000000003" TO AR-NUMBER
           MOVE "4321"       TO AR-PIN
           MOVE "Mike"       TO AR-FIRST
           MOVE "Wilson"     TO AR-LAST
           MOVE "C"          TO AR-TYPE
           MOVE 890.25       TO AR-BALANCE
           MOVE "A"          TO AR-STATUS
           MOVE 0            TO AR-DAILY-WD
           MOVE "00000000"   TO AR-LAST-WD-DATE
           MOVE 0            TO AR-FAIL-PINS
           MOVE "N"          TO AR-ADMIN
           WRITE ACCT-REC

      *>   Customer 4: Emma Brown - Savings - $45,000.00 (LOCKED)
           MOVE "1000000004" TO AR-NUMBER
           MOVE "9999"       TO AR-PIN
           MOVE "Emma"       TO AR-FIRST
           MOVE "Brown"      TO AR-LAST
           MOVE "S"          TO AR-TYPE
           MOVE 45000.00     TO AR-BALANCE
           MOVE "L"          TO AR-STATUS
           MOVE 0            TO AR-DAILY-WD
           MOVE "00000000"   TO AR-LAST-WD-DATE
           MOVE 3            TO AR-FAIL-PINS
           MOVE "N"          TO AR-ADMIN
           WRITE ACCT-REC

      *>   Admin Account
           MOVE "9999999999" TO AR-NUMBER
           MOVE "0000"       TO AR-PIN
           MOVE "System"     TO AR-FIRST
           MOVE "Admin"      TO AR-LAST
           MOVE "C"          TO AR-TYPE
           MOVE 0            TO AR-BALANCE
           MOVE "A"          TO AR-STATUS
           MOVE 0            TO AR-DAILY-WD
           MOVE "00000000"   TO AR-LAST-WD-DATE
           MOVE 0            TO AR-FAIL-PINS
           MOVE "Y"          TO AR-ADMIN
           WRITE ACCT-REC

           CLOSE ACCOUNT-FILE

      *>   Create empty transaction and audit files
           OPEN OUTPUT TRAN-FILE
           CLOSE TRAN-FILE
           OPEN OUTPUT AUDIT-FILE
           CLOSE AUDIT-FILE

           DISPLAY "Sample data created successfully."
           DISPLAY "  5 accounts (4 customers + 1 admin)"
           STOP RUN.
