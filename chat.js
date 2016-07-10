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

var memberSockets = [];

io.on('connection', function(socket) {
    socket.on('connect', function() {
        socketConnect(socket);
    });

    socket.on('join', function(joinMessage) {
        socketJoin(socket, joinMessage);
    });

    socket.on('disconnect', function() {
        socketDisconnect(socket);
    });

    socket.on('message', function(message) {
        handleMessage(socket, message);
    });

    socket.on('memberlist', function() {
        sendMemberlist(socket);
    })
});

function socketConnect(socket) {
    console.log('Socket connected');

}
function socketDisconnect(socket) {
    broadcastLeaveMessage(socket);

    delete memberSockets[socket.id];

    console.log('Socket disconnect');
}

function socketJoin(socket, joinMessage) {
    socket.userToken = joinMessage.userToken;
    socket.anonymousNameId = joinMessage.anonymousNameId;

    memberSockets[socket.id] = socket;

    console.log(memberSockets.length);
    lookupClient(socket);
}

function lookupClient(socket) {
    var query = null;

    if (socket.anonymousNameId) {
        query = 'SELECT name FROM anonymous_name WHERE id = ' + socket.anonymousNameId + ';';
    }

    if (socket.userToken) {
        query = 'SELECT username, colorRed, colorGreen, colorBlue, MD5(email) AS gravatarHash FROM fos_user_user WHERE token = \'' + socket.userToken + '\';';
    }

    runDatabaseQuery(query, setupClient, socket);
}

function setupClient(rows, socket) {
    var row = rows.pop();

    if (row.name) {
        socket.chat = {
            username: row.name,
            userColor: 'black',
            gravatarHash: 'identicon'
        };
    }

    if (row.username) {
        socket.chat = {
            username: row.username,
            userColor: 'rgb(' + row.colorRed + ', ' + row.colorGreen + ', ' + row.colorBlue + ')',
            gravatarHash: row.gravatarHash
        };
    }

    broadcastJoinMessage(socket);
}

function broadcastJoinMessage(socket) {
    var joinMessage = {
        userId: stripSpecialChars(socket.id),
        username: socket.chat.username,
        userColor: socket.chat.userColor,
        gravatarHash: socket.chat.gravatarHash,
        dateTime: Date.now()
    };

    console.log(socket.chat.username + ' joined');

    io.emit('joined', joinMessage);
}

function broadcastLeaveMessage(socket) {
    if (socket.chat) {
        var leaveMessage = {
            userId: stripSpecialChars(socket.id),
            username: socket.chat.username,
            dateTime: Date.now()
        };

        console.log(socket.chat.username + ' left');

        io.emit('left', leaveMessage);
    }
}

function handleMessage(socket, message) {
    if (!socket.chat) {
        return;
    }

    extendMessage(socket, message);
    broadcastMessage(socket, message);
    saveMessageToDatabase(socket, message);
}

function extendMessage(socket, message) {
    message.userId = stripSpecialChars(socket.id);
    message.username = socket.chat.username;
    message.userColor = socket.chat.userColor;
    message.gravatarHash = socket.chat.gravatarHash;
    message.timestamp = Date.now();
}

function broadcastMessage(socket, message) {
    io.emit('message', message);
}

function sendMemberlist(socket) {
    var memberlist = [];

    console.log(memberSockets.length);
    for (var index in memberSockets) {
        var userSocket = memberSockets[index];

        memberlist.push({
            userId: stripSpecialChars(userSocket.id),
            username: userSocket.chat.username,
            userColor: userSocket.chat.userColor,
            gravatarHash: userSocket.chat.gravatarHash
        });
    }

    console.log(memberlist);
    io.to(socket.id).emit('memberlist', memberlist);
}

function saveMessageToDatabase(socket, message) {
    var userpart = null;

    if (socket.userToken) {
        userpart = 'user_id = (SELECT id FROM fos_user_user WHERE token = \'' + socket.userToken + '\')';
    }

    if (socket.anonymousNameId) {
        userpart = 'anonymous_name_id = ' + socket.anonymousNameId;
    }

    if (userpart) {
        var query = 'INSERT INTO post SET ' + userpart + ', message = \'' + message.message + '\', dateTime = NOW(), enabled = 1, chat = 1;';

        runDatabaseQuery(query, null);
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

function stripSpecialChars(string) {
    string = string.replace('#', '');
    string = string.replace('/', '');

    return string;
}