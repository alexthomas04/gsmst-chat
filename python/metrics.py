import MySQLdb as mdb
import json
import re
import time
import os
import sys


con = mdb.connect('awsdb.cgpnw9vguc2k.us-west-2.rds.amazonaws.com', 'python', 's7754ez4GA53', 'chat');
users = []
userActivity = []
wordsCount = []
letters = []
times = []
rooms = []
sessions=[]
lurkFactor=[]
dics = {'users': users, 'userActivity': userActivity, 'words': wordsCount, 'letters': letters, 'time': times,
        'rooms': rooms,'sessions':sessions,'lurkFactor':lurkFactor}


def getKeyValue(key, array):
    for pair in array:
        if pair['key'] == key:
            return pair
    pair = {'key': key, 'value': 0}
    array.append(pair)
    return pair


def incrementValue(key, array):
    pair = getKeyValue(key, array)
    pair['value'] += 1

def processMetrics(con):
    with con:
        cur = con.cursor(mdb.cursors.DictCursor)

        cur.execute('SELECT * FROM users')
        for i in range(cur.rowcount):
            dbUser = cur.fetchone()
            user = {}
            user['id'] = dbUser['id']
            user['username'] = dbUser['username']
            users.append(user)

        cur.execute('SELECT id,name FROM rooms')
        for i in range(cur.rowcount):
            dbRoom = cur.fetchone();
            room = {'value': 0}
            room['name'] = dbRoom['name']
            room['key'] = dbRoom['id']
            rooms.append(room)

        cur.execute("SELECT * FROM chat")
        for i in range(cur.rowcount):
            row = cur.fetchone()
            incrementValue(row['user_id'], userActivity)
            incrementValue(row['room_id'], rooms)
            hour = time.strptime(str(row['time']), '%Y-%m-%d %H:%M:%S').tm_hour
            incrementValue(hour, times)
            text = row['message'].decode('iso-8859-1').encode('utf-8').strip()
            words = text.split()
            for word in words:
                word = word.decode('iso-8859-1').encode('utf-8').strip()
                if word != ' ':
                    incrementValue(word, wordsCount)
                    for letter in word:
                        letter = letter.decode('iso-8859-1').encode('utf-8').strip()
                        if letter != ' ':
                            incrementValue(letter, letters)

        cur.execute('SELECT * FROM sessions')
        for i in range(cur.rowcount):
            row = cur.fetchone()
            pair = getKeyValue(row['user_id'],sessions)
            pair['value'] += row['duration']

        for u in userActivity:
            session = None
            for s in sessions:
                if s['key'] == u['key']:
                    session=s
            if not session == None:
                pair={'key':u['key'],'value':session['value']/u['value']}
                lurkFactor.append(pair)

        jsonData = json.dumps(dics)
        cur.execute('INSERT INTO metrics (metrics,time) VALUES (%s,NOW())',[jsonData])
con = mdb.connect('awsdb.cgpnw9vguc2k.us-west-2.rds.amazonaws.com', 'python', 's7754ez4GA53', 'chat')
processMetrics(con)
con = mdb.connect('awsdb.cgpnw9vguc2k.us-west-2.rds.amazonaws.com', 'python', 's7754ez4GA53', 'chat2')
processMetrics(con)