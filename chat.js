var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var fs = require('fs');
var mysqlConnectionPool = require('../api-commons/connectionPool.js').mysqlConnectionPool;

var configFile = fs.readFileSync('../api-commons/config.json');
var config;

try {
    config = JSON.parse(configFile);
} catch (err) {
    console.log('There has been an error parsing your JSON.');
    console.log(err);
}

app.get('/', function(req, res){
    res.send('<h1>Hello world</h1>');
});

http.listen(3000, function(){
    console.log('listening on *:3000');
});

io.on('connection', function(socket){
    socket.on('message', function(message) {

        queryMessageUser(message);

        saveMessageToDatabase(message);
    });
});

function queryMessageUser(message) {
    var query = null;

    if (message.anonymousNameId) {
        query = 'SELECT name FROM anonymous_name WHERE id = ' + message.anonymousNameId + ';';
    }

    if (message.userToken) {
        query = 'SELECT username, colorRed, colorGreen, colorBlue FROM fos_user_user WHERE token = \'' + message.userToken + '\';';
    }

    runDatabaseQuery(query, extendMessage, message);
}

function extendMessage(rows, message) {
    message.timestamp = Date.now();

    var row = rows.pop();

    if (row.name) {
        message.username = row.name;
        message.userColor = 'black';
    }

    if (row.username) {
        message.username = row.username;
        message.userColor = 'rgb(' + row.colorRed + ', ' + row.colorGreen + ', ' + row.colorBlue + ')';
    }

    broadcastMessage(message);
}

function broadcastMessage(message) {
    io.emit('message', message);
}

function saveMessageToDatabase(message) {
    var userpart = null;

    if (message.userToken) {
        userpart = 'user_id = (SELECT id FROM fos_user_user WHERE token = \'' + message.userToken + '\')';
    }

    if (message.anonymousNameId) {
        userpart = 'anonymous_name_id = ' + message.anonymousNameId;
    }

    if (userpart) {
        var query = 'INSERT INTO post SET ' + userpart + ', message = \'' + message.message + '\', dateTime = NOW(), enabled = 1, chat = 1;';

        runDatabaseQuery(query, null);

        console.log(query);
    }
}

function runDatabaseQuery(queryString, callbackFunction, argument) {
    mysqlConnectionPool.getConnection(function(err, connection) {
        connection.query('USE ' + config.database.dbname + ';', function(err, rows) {
            connection.query(queryString, function(err, rows) {
                connection.release();

                if (callbackFunction) {
                    callbackFunction(rows, argument);
                }
            });
        });
    });
}