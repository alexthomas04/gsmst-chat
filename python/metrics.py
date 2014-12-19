import MySQLdb as mdb
import json
import re
import time
import os
import sys
from operator import attrgetter
import math
from decimal import *
from collections import Counter


config = open('config.json')
config = json.load(config)
getcontext().prec = 3
statements = []


def getKeyValue(key, array):
    for pair in array:
        if pair['key'] == key:
            return pair
    pair = {'key': key, 'value': 0}
    array.append(pair)
    return pair


def processChat(row, userActivity, rooms, times, words, letters):
    userActivity.append(row['user_id'])
    rooms.append(row['room_id'])
    hour = time.strptime(str(row['time']), '%Y-%m-%d %H:%M:%S').tm_hour
    times.append(hour)
    text = row['message']
    text = text.lower()
    strings = text.split()
    for word in strings:
        word = word.decode('iso-8859-1').encode('utf-8').strip()
        if word != ' ':
            words.append(word)
            for letter in word:
                letter = letter.decode('iso-8859-1').encode('utf-8').strip()
                if letter != ' ':
                    letters.append(letter)


def format_time(ms):
    value = ms
    ms = ms % 1000
    value /= 1000
    seconds = value % 60
    value /= 60
    minutes = value % 60
    value /= 60
    hours = value / 60
    string = ''
    ms = int(ms)
    seconds = int(seconds)
    minutes = int(minutes)
    hours = int(hours)
    if hours > 0:
        if hours > 1:
            string += str(hours) + ' Hours '
        else:
            string += str(hours) + ' Hour '
    if minutes > 0:
        if minutes > 1:
            string += str(minutes) + ' Minutes '
        else:
            string += str(minutes) + ' Minute '
    if seconds > 0:
        if seconds > 1:
            string += str(seconds) + ' Seconds '
        else:
            string += str(seconds) + ' Second '
    if ms > 0:
        if ms > 1:
            string += str(ms) + ' Milliseconds '
        else:
            string += str(ms) + ' Millisecond '
    return string


def fromSet(set):
    temp = []
    for key, val in set.iteritems():
        temp.append({'key': key, 'value': val})
    return temp


def processMetrics(con):
    users = []
    userActivity = []
    words = []
    letters = []
    times = []
    rooms = []
    sessions = []
    lurkFactor = []


    time_markings=[]

    userActivity_set = {}
    words_set = {}
    letters_set = {}
    times_set = {}
    rooms_set = {}

    def dump_set(given, old_set):
        new_set = {}.fromkeys(given)
        for i in given:
            if new_set[i] == None:
                new_set[i] = 0
            new_set[i] += 1
        del given[:]
        return Counter(new_set) + Counter(old_set)

    def getKeyValue(key, array):
        for pair in array:
            if pair['key'] == key:
                return pair
        pair = {'key': key, 'value': 0}
        array.append(pair)
        return pair


    with con:
        cur = con.cursor(mdb.cursors.DictCursor)

        cur.execute('SELECT * FROM users')
        for i in range(cur.rowcount):
            dbUser = cur.fetchone()
            user = {}
            user['id'] = dbUser['id']
            user['username'] = dbUser['username']
            users.append(user)

        # cur.execute('SELECT id,name FROM rooms')
        # for i in range(cur.rowcount):
        # dbRoom = cur.fetchone();
        #     room = {'value': 0}
        #     room['name'] = dbRoom['name']
        #     room['key'] = dbRoom['id']
        #     rooms.append(room)

        cur.execute("SELECT COUNT(*) FROM chat")
        prev = 0
        step = 1000
        count = cur.fetchone()['COUNT(*)']
        start_time = time.time()
        for i in range(0, count, step):
            cur.execute("SELECT * FROM chat LIMIT %s,%s" % (i, step))
            for row in cur.fetchall():
                processChat(row, userActivity, rooms, times, words, letters)
            percent = Decimal(i * 100) / Decimal(count)
            if percent >= 10:
                getcontext().prec = 3
            elif percent >= 1:
                getcontext().prec = 4
            if percent > prev:
                prev = percent
                diff = ((time.time() - start_time) * 1000)
                per_percent = diff / float(percent)
                total = per_percent * 100
                left = total - total * float(percent) / 100
                print str(prev) + '%'# Estimate ' + format_time(left) + ' left'
            if i % 10000 == 0:
                words_set = dump_set(words, words_set)
                letters_set = dump_set(letters, letters_set)
                times_set = dump_set(times, times_set)
                rooms_set = dump_set(rooms, rooms_set)
                userActivity_set = dump_set(userActivity, userActivity_set)
        words_set = dump_set(words, words_set)
        letters_set = dump_set(letters, letters_set)
        times_set = dump_set(times, times_set)
        rooms_set = dump_set(rooms, rooms_set)
        userActivity_set = dump_set(userActivity, userActivity_set)

        cur.execute('SELECT * FROM sessions')
        for i in range(cur.rowcount):
            row = cur.fetchone()
            pair = getKeyValue(row['user_id'], sessions)
            pair['value'] += row['duration']

        words = fromSet(words_set)
        letters = fromSet(letters_set)
        times = fromSet(times_set)
        rooms = fromSet(rooms_set)
        userActivity = fromSet(userActivity_set)

        words = sorted(words, key=lambda obj: obj['value'])

        for u in userActivity:
            session = None
            for s in sessions:
                if s['key'] == u['key']:
                    session = s
            if not session == None:
                pair = {'key': u['key'], 'value': session['value'] / u['value']}
                lurkFactor.append(pair)
        dics = {'users': users, 'userActivity': userActivity, 'words': words, 'letters': letters, 'time': times,
                'rooms': rooms, 'sessions': sessions, 'lurkFactor': lurkFactor}
        jsonData = json.dumps(dics)
        open('metrics.json', 'w').write(jsonData)
        cur.execute('INSERT INTO metrics (metrics,time) VALUES (\'\',NOW())')
        text_increment=4096
        for i in range(0,len(jsonData),text_increment):
            cur.execute('UPDATE metrics SET metrics= CONCAT(metrics,%s) ORDER BY time DESC LIMIT 1',[jsonData[i:i+text_increment]])



con = mdb.connect(config['host'], config['user'], config['password'], config['database'])

time1 = time.time()
processMetrics(con)
time2 = time.time()
print 'took %0.3f ms' % ((time2 - time1) * 1000.0)