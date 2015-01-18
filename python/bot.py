__author__ = 'Sonicdeadlock'
import socket
import sys
from thread import *
import MySQLdb as mdb
import json
import random

HOST = ''
PORT = 8889
config = open('config.json')
config = json.load(config)
con = mdb.connect(config['host'], config['user'], config['password'], config['database'])

# Datagram (udp) socket
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    print 'Socket created'
except socket.error, msg:
    print 'Failed to create socket. Error Code : ' + str(msg[0]) + ' Message ' + msg[1]
    sys.exit()


# Bind socket to local host and port
try:
    s.bind((HOST, PORT))
except socket.error, msg:
    print 'Bind failed. Error Code : ' + str(msg[0]) + ' Message ' + msg[1]
    sys.exit()

print 'Socket bind complete'


# Function for handling connections. This will be used to create threads

def select_like(table, column, text):
    with con:
        cur = con.cursor(mdb.cursors.DictCursor)
        sql = 'SELECT * FROM %s WHERE %s LIKE \'%s\' LIMIT 1' % (table, column, text)
        cur.execute(sql)
        return cur.fetchone()


def get_action(id):
    with con:
        cur = con.cursor(mdb.cursors.DictCursor)
        cur.execute('SELECT action FROM actions WHERE id = %s LIMIT 1', (id,))
        return cur.fetchone()['action']


def get_response(id):
    with con:
        cur = con.cursor()
        cur.execute('SELECT COUNT(*) FROM responses WHERE input_id = %s', (id,))
        count = cur.fetchone()[0]
        if not count == 0:
            index = random.randrange(0, count)
            cur.execute('SELECT response FROM responses WHERE input_id = %s LIMIT %s ,1', (id, index))
            return cur.fetchone()[0]


def processchat(data):
    if data:
        data = json.loads(data)
        user = data['user']
        chat = data['chat']
        chat = chat.replace("'", "''")
        response = {}
        response['user'] = 'SONICBOT'
        response['room_id'] = data['room_id']
        if chat.startswith('!add'):
            if data['rank'] == 'Creator':
                parts = chat.split(' ')
                command = parts[1]
                respond = ''
                for s in parts[2:len(parts)]:
                    respond += s + ' '
                existing_command = select_like('inputs', 'input', command)
                with con:
                    cur = con.cursor()
                    if existing_command == None:
                        cur.execute('INSERT INTO inputs (input,action_id) VALUES (%s,1)', (command,))
                        existing_command = select_like('inputs', 'input', command)
                        response['chat'] = "{0} -> Added command: {1}".format(user,command)
                    else:
                        response['chat'] = "{0} -> Appended to command: {1}".format(user,command)
                    cur.execute('INSERT INTO responses (input_id,response) VALUES (%s,%s)', (existing_command['id'], respond))
                    dump = json.dumps(response)
                    return dump
            else:
                response['chat'] = 'You do not have permission to do that!'
                dump = json.dumps(response)
                return dump
        else:
            parts = chat.split(' ')
            command = parts[0]
            userinput = select_like('inputs', 'input', command)
            if not userinput == None:
                action = get_action(userinput['action_id'])
                if action == 'respond':
                    response['chat'] = get_response(userinput['id']).format(user)
                elif action == 'commands':
                    with con:
                        cur = con.cursor()
                        cur.execute('SELECT input from inputs WHERE 1=1')
                        result = cur.fetchall()
                        commands = ''
                        for row in result:
                            commands += row[0]+', '
                        commands = commands[:len(commands)-2]
                        response['chat'] = commands
                elif action == 'var1':
                    response['chat'] = get_response(userinput['id']).format(parts[1])
                dump = json.dumps(response)
                return dump


def check_for_words(data):
    if data:
        data = json.loads(data)
        user = data['user']
        chat = data['chat']
        response = {}
        response['user'] = 'SONICBOT'
        response['room_id'] = data['room_id']
        count = chat.count("<span class='text-danger'>&nbsp;[CENSORED]</span>")
        if count > 0:
            if count==1:
                response['chat'] = '{0} -> That was a bad word!'.format(user)
            else:
                response['chat'] = '{0} -> Wow {1} bad words!'.format(user,count)
            dump = json.dumps(response)
            return dump



#now keep talking with the client
while 1:
    #wait to accept a connection - blocking call
    try:
       data, addr = s.recvfrom(4096)
    except:
        print('chat too long')
    else:
        response = processchat(data)
        if response:
            addr = (addr[0],8888)
            s.sendto(bytes(response), addr)
        words = check_for_words(data)
        if words:
            addr = (addr[0],8888)
            s.sendto(bytes(words), addr)

s.close()