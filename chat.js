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

var clients = [];

io.on('connection', function(socket) {
    io.sockets.on('connect', function(client) {
        client.on('join', function(joinMessage) {
            joinClient(client, joinMessage);
        });

        client.on('disconnect', function() {
            disconnectClient(client);
        });
    });

    socket.on('message', function(message) {
        handleMessage(client, message);
    });
});

function disconnectClient(client) {
    clients.splice(clients.indexOf(client), 1);

    console.log('disconnect');
}

function joinClient(client, joinMessage) {
    client.userToken = joinMessage.userToken;
    client.anonymousNameId = joinMessage.anonymousNameId;

    lookupClient(client);
}

function lookupClient(client) {
    var query = null;

    if (client.anonymousNameId) {
        query = 'SELECT name FROM anonymous_name WHERE id = ' + client.anonymousNameId + ';';
    }

    if (client.userToken) {
        query = 'SELECT username, colorRed, colorGreen, colorBlue, MD5(email) AS gravatarHash FROM fos_user_user WHERE token = \'' + client.userToken + '\';';
    }

    runDatabaseQuery(query, setupClient, client);
}

function setupClient(rows, client) {
    var row = rows.pop();

    if (row.name) {
        client.username = row.name;
        client.userColor = 'black';
        client.gravatarHash = '?d=identicon&s=64';
    }

    if (row.username) {
        client.username = row.username;
        client.userColor = 'rgb(' + row.colorRed + ', ' + row.colorGreen + ', ' + row.colorBlue + ')';
        client.gravatarHash = row.gravatarHash;
    }

    broadcastJoinMessage(client);
}

function broadcastJoinMessage(client) {
    var joinMessage = {
        username: client.username,
        dateTime: Date.now()
    };

    console.log(client.username + ' joined');
    io.emit('joined', joinMessage);
}

function handleMessage(client, message) {
    extendMessage(client, message);
    broadcastMessage(client, message);
}
function extendMessage(client, message) {
    message.username = client.username;
    message.userColor = client.userColor;
    message.timestamp = Date.now();
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