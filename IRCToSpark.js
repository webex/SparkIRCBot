// Description
////////////////////////////////////////
// This script is designed to relay   //
// messages from Cisco Spark and IRC  //
// to one another, as well as handle  //
// additional commands from the users //
////////////////////////////////////////

// Pre-requesits
////////////////////////////////////////
// - Your bot/user must already be    //
// apart of the room you'd like him   //
// to function within.                //
// - All of the external libraries    //
// must be installed:                 //
// - - node-irc                       //
// - - request                        //
////////////////////////////////////////

// External libraries
var request = require('request');
var http = require('http');
var irc = require('irc');

// Predefined variables

var portNumber = 8080; // Set listen port number
var botName = {irc:'IRCToSparkBot', spark:'IRCToSparkBot', sparkEmail:'IRCToSparkBot@sparkbot.io'}; // The name of your bot
var myChannel = '#mychan'; // The channel your bot is active on
var myToken = ''; // user/bot bearer token
var myRoomID = ''; // Spark RoomId for bot
var sparkHeaders = {'content-type': 'application/json; charset=utf-8', 'Authorization':'Bearer ' + myToken}; // Basic Cisco Spark Header
var messagesURL = 'https://api.ciscospark.com/v1/messages/'; // Spark Messages API URL, do not modify
var helpMessage = 'This is an example help message for the IRC to Spark bot.';
var commands = {
  m:{args:0},
  pm:{args:1},
  help:{args:0}
};

function messageInterpreter(myMessage) {

  var myReturnObj = {};
  var preProcessedString = myMessage;
  var index = 0;
  
  if (myMessage === undefined) {
    return '';
  }
  
  //Determines Command
  preProcessedString = myMessage.slice(myMessage.search(botName.spark) + botName.spark.length + 1);
  if (preProcessedString.includes(' ')) {
    index = preProcessedString.search(' ');
    myReturnObj.command = preProcessedString.slice(0, index);
    preProcessedString = preProcessedString.slice(index + 1);
  } else {
    myReturnObj.command = preProcessedString.slice(0);
    return myReturnObj;
  }

  if (commands.hasOwnProperty(myReturnObj.command)) {
    myReturnObj.argument = {};
    for (i = 0; i < commands[myReturnObj.command].args; i++) {
      index = preProcessedString.search(' ');
      myReturnObj.argument[i] = preProcessedString.slice(0, index);
      preProcessedString = preProcessedString.slice(index + 1);
    }
    myReturnObj.value = preProcessedString;
  }
  return myReturnObj;
}

function sendRequest(myURL, myMethod, myHeaders, myData, callback) { // Sends RESTful requests
  
  var options = {
    url: myURL,
    method: myMethod,
    json: true,
    headers: myHeaders,
    body: myData
  };
  
  var res = '';
  
  request(options, function optionalCallback(error, response, body) {
    if (error) {
      res = "Request Failed: " + error;
    } else {
      res = body;
    }
    callback(res)
  });
}

var bot = new irc.Client('irc.freenode.net', botName.irc, { //Create Bot
    channels: [myChannel]
});

bot.addListener('message' + myChannel, function (from, message) { // Add listener for channel
  sendRequest(messagesURL, "POST", sparkHeaders, { roomId: myRoomID, text: from + ': ' + message}, function(resp){});
});

bot.addListener('pm', function (from, message) { // Add listener for PM
  sendRequest(messagesURL, "POST", sparkHeaders, { roomId: myRoomID, text: 'PM from ' + from + ': ' + message}, function(resp){});
});

bot.addListener('join', function(channel, who) { // Add listener for user joins
  sendRequest(messagesURL, "POST", sparkHeaders, { roomId: myRoomID, text: who + ' has joined ' + channel + ' - '}, function(resp){});
});

bot.addListener('part', function(channel, who, reason) { // Add listener for user parts
  sendRequest(messagesURL, "POST", sparkHeaders, { roomId: myRoomID, text: who + ' has left ' + channel + ' - '}, function(resp){});
});


http.createServer(function (req, res) { // Set up web listener to receive Webhook POST / Relaying. AKA the magic.
  if (req.method == 'POST') {

    req.on('data', function(chunk) {
      var resObj = JSON.parse(chunk.toString());
      sendRequest(messagesURL + resObj.data.id, "GET", sparkHeaders, '', function(resp){
        var myMessageObj = {};
        if (resp.personEmail != botName.sparkEmail) {myMessageObj = messageInterpreter(resp.text);}
        
        switch (myMessageObj.command) {
          case 'pm': 
            if (bot.chans[myChannel].users.hasOwnProperty(myMessageObj.argument[0]) && myMessageObj.value !== '') {
              bot.say(myMessageObj.argument[0], myMessageObj.value);
            } else if (myMessageObj.value === '') {
              sendRequest(messagesURL, "POST", sparkHeaders, { roomId: myRoomID, text: 'PM FAILED TO ' + myMessageObj.argument[0] + ' FAILED: NO VALUE TO SEND'}, function(resp){});
            } else {
              sendRequest(messagesURL, "POST", sparkHeaders, { roomId: myRoomID, text: 'PM FAILED: USER ' + myMessageObj.argument[0] + ' DOESNT EXIST '}, function(resp){});
            }
            break;
            
          case 'm':
            bot.say(myChannel, myMessageObj.value);
            break;
            
          case 'help':
            sendRequest(messagesURL, "POST", sparkHeaders, { roomId: myRoomID, text: helpMessage}, function(resp){});
            break;
            
        }
      });
    });

    req.on('end', function() {
      res.writeHead(200, "OK", {'Content-Type': 'text/html'});
      res.end();
    });

  } else {
    console.log("[405] " + req.method + " to " + req.url);
    res.writeHead(405, "Method not supported", {'Content-Type': 'text/html'});
    res.end('405 - Method not supported');
  }
}).listen(portNumber); // listen on tcp portNumber value (all interfaces)