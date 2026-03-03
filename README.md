# COBOL ATM

**Anthropic drops 13%. IBM stock rises. Somewhere, a mainframe consultant weeps into their JCL.**

I asked Claude Code to build a fully working ATM prototype in COBOL — the 65-year-old language that still processes 95% of ATM transactions worldwide. It wrote 400+ lines of COBOL, a Python bridge server, and a full ATM interface. From one prompt.

IBM's entire consulting division is built on being the only people who can write COBOL. Anthropic just made that a one-prompt job.

## The Stack (Yes, Really)

```
HTML Frontend  →  Python/Flask  →  Compiled COBOL Binary  →  Flat Files
    (2024)           (2024)            (1959 energy)          (literally just .DAT files)
```

The HTML talks to Python. Python shells out to a compiled COBOL binary. COBOL reads and writes flat files — just like mainframe banking systems have done since the 1960s. No database. No ORM. No Docker. Just `PERFORM DO-WITHDRAW` and vibes.

## What It Does

- PIN verification with account lockout (3 strikes, you're out)
- Cash withdrawals with daily limits (£500/day, we're not animals)
- Balance enquiries
- Deposits
- Account transfers
- Mini statements (last 5 transactions from a flat file)
- Full transaction logging
- Audit trail for security events

All business logic runs in COBOL. The Python server is just a translator. The frontend is just a pretty face.

## Running It

### Prerequisites

- [GnuCOBOL](https://gnucobol.sourceforge.io/) (`brew install gnucobol`)
- Python 3 with Flask (`pip install flask`)

### Build & Run

```bash
# Compile the COBOL
chmod +x build.sh
./build.sh

# Set up test accounts
./setup-data

# Start the server
python3 server.py
```

Open `http://localhost:5001` in your browser.

### Test Account

- **Account:** `1234567890`
- **PIN:** `1234`

## The COBOL

The banking engine (`ATM-SYSTEM.cob`) is pure COBOL-85. `WORKING-STORAGE SECTION`, `PIC X`, `PERFORM` paragraphs, `READ`/`WRITE` on sequential files — the whole thing. It compiles with GnuCOBOL and runs as a native binary that accepts commands via command-line arguments and returns pipe-delimited responses.

```cobol
PERFORM CHECK-PIN
IF PIN-VALID
    PERFORM DO-WITHDRAW
    PERFORM LOG-TRANSACTION
END-IF
```

Somewhere an IBM consultant just felt a disturbance in the force.

## Why

Because Claude Code can write COBOL better than most humans, and that's either hilarious or terrifying depending on whether you bill by the hour for mainframe migrations.

## License

MIT — do whatever you want with it. IBM can't charge you $400/hour for this one.
