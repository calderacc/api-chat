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
        message.timestamp = Date.now();
        message.username = 'maltehuebner';
        message.userColor = 'rgb(255, 255, 0)';

        io.emit('message', message);
        saveMessageToDatabase(message);
    });
});

function saveMessageToDatabase(message) {
    var query = 'INSERT INTO post SET user_id = (SELECT id FROM fos_user_user WHERE token = \'' + message.userToken + '\'), message = \'' + message.message + '\', dateTime = NOW(), enabled = 1, chat = 1;';

    runDatabaseQuery(query, null);

    console.log(query);
}

function runDatabaseQuery(queryString, callbackFunction) {
    mysqlConnectionPool.getConnection(function(err, connection) {
        connection.query('USE ' + config.database.dbname + ';', function(err, rows) {
            connection.query(queryString, function(err, rows) {
                connection.release();

                if (callbackFunction) {
                    callbackFunction(rows);
                }
            });
        });
    });
}