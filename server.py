"""Flask bridge server connecting HTML ATM frontend to COBOL ATM engine."""

import subprocess
import threading
import os
from flask import Flask, request, jsonify, session, send_from_directory

app = Flask(__name__, static_folder='static')
app.secret_key = 'cobol-atm-prototype-key-2026'

# Serialize COBOL process calls (file-level locking)
cobol_lock = threading.Lock()

COBOL_BIN = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'atm-system')


def run_cobol(command):
    """Run the COBOL ATM engine with a command string. Returns list of output lines."""
    with cobol_lock:
        try:
            result = subprocess.run(
                [COBOL_BIN],
                input=command + '\n',
                capture_output=True,
                text=True,
                timeout=10,
                cwd=os.path.dirname(os.path.abspath(__file__))
            )
            output = result.stdout.strip()
            if not output:
                stderr = result.stderr.strip()
                return [f'ERR|SYSTEM|COBOL returned no output: {stderr}']
            return output.split('\n')
        except subprocess.TimeoutExpired:
            return ['ERR|TIMEOUT|COBOL process timed out']
        except FileNotFoundError:
            return ['ERR|NOT-FOUND|COBOL binary not found. Run build.sh first.']
        except Exception as e:
            return [f'ERR|SYSTEM|{str(e)}']


def parse_response(lines):
    """Parse first line of COBOL response into status dict."""
    parts = lines[0].split('|')
    if parts[0].strip() == 'OK':
        return {'status': 'ok', 'fields': [p.strip() for p in parts[1:]]}
    else:
        code = parts[1].strip() if len(parts) > 1 else 'UNKNOWN'
        msg = parts[2].strip() if len(parts) > 2 else 'Unknown error'
        return {'status': 'error', 'code': code, 'message': msg}


@app.route('/')
def index():
    return send_from_directory('static', 'index.html')


@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    account = data.get('account', '').strip()
    pin = data.get('pin', '').strip()

    if not account or not pin:
        return jsonify({'status': 'error', 'code': 'MISSING', 'message': 'Account and PIN required'})

    lines = run_cobol(f'CHECK-PIN {account} {pin}')
    resp = parse_response(lines)

    if resp['status'] == 'ok':
        session['account'] = account
        session['name'] = resp['fields'][0]
        session['acct_type'] = resp['fields'][1] if len(resp['fields']) > 1 else ''
        return jsonify({
            'status': 'ok',
            'name': session['name'],
            'type': session['acct_type']
        })
    else:
        return jsonify(resp)


@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'status': 'ok'})


@app.route('/api/balance')
def balance():
    account = session.get('account')
    if not account:
        return jsonify({'status': 'error', 'code': 'AUTH', 'message': 'Not logged in'})

    lines = run_cobol(f'BALANCE {account}')
    resp = parse_response(lines)

    if resp['status'] == 'ok':
        return jsonify({
            'status': 'ok',
            'balance': resp['fields'][0],
            'type': resp['fields'][1] if len(resp['fields']) > 1 else ''
        })
    return jsonify(resp)


@app.route('/api/withdraw', methods=['POST'])
def withdraw():
    account = session.get('account')
    if not account:
        return jsonify({'status': 'error', 'code': 'AUTH', 'message': 'Not logged in'})

    data = request.get_json()
    amount = data.get('amount', '').strip()
    if not amount:
        return jsonify({'status': 'error', 'code': 'MISSING', 'message': 'Amount required'})

    lines = run_cobol(f'WITHDRAW {account} {amount}')
    resp = parse_response(lines)

    if resp['status'] == 'ok':
        return jsonify({
            'status': 'ok',
            'amount': resp['fields'][0],
            'balance': resp['fields'][1] if len(resp['fields']) > 1 else ''
        })
    return jsonify(resp)


@app.route('/api/deposit', methods=['POST'])
def deposit():
    account = session.get('account')
    if not account:
        return jsonify({'status': 'error', 'code': 'AUTH', 'message': 'Not logged in'})

    data = request.get_json()
    amount = data.get('amount', '').strip()
    if not amount:
        return jsonify({'status': 'error', 'code': 'MISSING', 'message': 'Amount required'})

    lines = run_cobol(f'DEPOSIT {account} {amount}')
    resp = parse_response(lines)

    if resp['status'] == 'ok':
        return jsonify({
            'status': 'ok',
            'amount': resp['fields'][0],
            'balance': resp['fields'][1] if len(resp['fields']) > 1 else ''
        })
    return jsonify(resp)


@app.route('/api/transfer', methods=['POST'])
def transfer():
    account = session.get('account')
    if not account:
        return jsonify({'status': 'error', 'code': 'AUTH', 'message': 'Not logged in'})

    data = request.get_json()
    dest = data.get('destination', '').strip()
    amount = data.get('amount', '').strip()
    if not dest or not amount:
        return jsonify({'status': 'error', 'code': 'MISSING', 'message': 'Destination and amount required'})

    lines = run_cobol(f'TRANSFER {account} {dest} {amount}')
    resp = parse_response(lines)

    if resp['status'] == 'ok':
        return jsonify({
            'status': 'ok',
            'amount': resp['fields'][0],
            'balance': resp['fields'][1] if len(resp['fields']) > 1 else ''
        })
    return jsonify(resp)


@app.route('/api/statement')
def statement():
    account = session.get('account')
    if not account:
        return jsonify({'status': 'error', 'code': 'AUTH', 'message': 'Not logged in'})

    lines = run_cobol(f'MINI-STMT {account}')
    resp = parse_response(lines)

    if resp['status'] == 'ok':
        count = int(resp['fields'][0]) if resp['fields'] else 0
        transactions = []
        for i in range(1, min(count + 1, len(lines))):
            parts = lines[i].split('|')
            if len(parts) >= 5:
                transactions.append({
                    'date': parts[0].strip(),
                    'type': parts[1].strip(),
                    'amount': parts[2].strip(),
                    'balance': parts[3].strip(),
                    'description': parts[4].strip()
                })
        return jsonify({
            'status': 'ok',
            'count': count,
            'transactions': transactions
        })
    return jsonify(resp)


@app.route('/api/change-pin', methods=['POST'])
def change_pin():
    account = session.get('account')
    if not account:
        return jsonify({'status': 'error', 'code': 'AUTH', 'message': 'Not logged in'})

    data = request.get_json()
    old_pin = data.get('old_pin', '').strip()
    new_pin = data.get('new_pin', '').strip()
    if not old_pin or not new_pin:
        return jsonify({'status': 'error', 'code': 'MISSING', 'message': 'Old and new PIN required'})

    if len(new_pin) != 4 or not new_pin.isdigit():
        return jsonify({'status': 'error', 'code': 'INVALID', 'message': 'PIN must be 4 digits'})

    lines = run_cobol(f'CHANGE-PIN {account} {old_pin} {new_pin}')
    resp = parse_response(lines)

    if resp['status'] == 'ok':
        return jsonify({
            'status': 'ok',
            'message': resp['fields'][0] if resp['fields'] else 'PIN changed'
        })
    return jsonify(resp)


BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def read_flat_file(filename):
    """Read a flat data file, return lines."""
    path = os.path.join(BASE_DIR, filename)
    try:
        with open(path, 'r') as f:
            return f.readlines()
    except FileNotFoundError:
        return []


@app.route('/api/admin/audit')
def admin_audit():
    lines = read_flat_file('AUDITLOG.DAT')
    entries = []
    for line in lines:
        if len(line.strip()) < 24:
            continue
        entries.append({
            'date': line[0:8].strip(),
            'time': line[8:14].strip(),
            'account': line[14:24].strip(),
            'action': line[24:44].strip(),
            'detail': line[44:].strip(),
        })
    return jsonify({'status': 'ok', 'entries': entries})


@app.route('/api/admin/accounts')
def admin_accounts():
    lines = read_flat_file('ACCOUNTS.DAT')
    accounts = []
    for line in lines:
        if len(line.strip()) < 67:
            continue
        raw_bal = line[55:66].strip()
        try:
            bal = float(raw_bal) / 100
        except ValueError:
            bal = 0
        status_char = line[66] if len(line) > 66 else 'A'
        accounts.append({
            'account': line[0:10].strip(),
            'first_name': line[14:34].strip(),
            'last_name': line[34:54].strip(),
            'type': 'Current' if line[54] == 'C' else 'Savings',
            'balance': f'{bal:.2f}',
            'status': 'Locked' if status_char == 'L' else 'Active',
        })
    return jsonify({'status': 'ok', 'accounts': accounts})


@app.route('/api/admin/translog')
def admin_translog():
    lines = read_flat_file('TRANSLOG.DAT')
    transactions = []
    for line in lines:
        if len(line.strip()) < 45:
            continue
        raw_amt = line[34:45].strip()
        try:
            amt = float(raw_amt) / 100
        except ValueError:
            amt = 0
        transactions.append({
            'date': line[0:8].strip(),
            'time': line[8:14].strip(),
            'account': line[14:24].strip(),
            'type': line[24:34].strip(),
            'amount': f'{amt:.2f}',
            'description': line[56:].strip() if len(line) > 56 else '',
        })
    return jsonify({'status': 'ok', 'transactions': transactions})


# Serve CSS/JS from static subdirectories
@app.route('/css/<path:filename>')
def serve_css(filename):
    return send_from_directory(os.path.join('static', 'css'), filename)


@app.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory(os.path.join('static', 'js'), filename)


if __name__ == '__main__':
    print("=" * 50)
    print("  COBOL ATM Server")
    print("  Open http://localhost:5001 in your browser")
    print("=" * 50)
    app.run(debug=True, host='0.0.0.0', port=5001)
