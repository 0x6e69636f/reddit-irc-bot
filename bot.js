var irc = require("irc");
var reddit = require("redwrap");

var SERVER_URL = "irc.freenode.org"; // THE IRC SERVER TO CONNECT TO
var BOT_NICK = "RedditBrowser"; // THE BOT NICK NAME
var MAIN_CHANNEL = "#reddit"; // THE MAIN CHANNEL TO JOIN
var CHANNELS_LIST = [MAIN_CHANNEL]; // THE LIST OF ALL CHANNELS TO JOIN
var USERS = {}; // THE USERS MAP
var DELAY = 1000; // DELAY BETWEEN EACH MESSAGE TO A USER
var LIMIT = 10; // LIMIT THE AMOUNT OF REQUESTED ENTRIES

// Function library "name" : { "description":"", "action":function(nick, params){ function_to_call(nick, params); } } 
var FUNCTIONS = {
  "browse": { "description":"Browse a subreddit", "action":function (nick, params) { browse(nick, params); } },
  "!": { "description":"Browse a subreddit", "action":function (nick, params) { browse(nick, params); } },
  "more": { "description":"Get more from a subreddit", "action": function (nick, params) { browse(nick, params, true); } },
  "+": { "description":"Get more from a subreddit", "action": function (nick, params) { browse(nick, params, true); } }
};

// IRC Client object construction
var client = new irc.Client(SERVER_URL, BOT_NICK, { channels: CHANNELS_LIST });

// Message Listener
client.addListener("message", function (from, to, msg) {
  handle_msg(from, to, msg);
});

client.addListener('registered', function(message) {
    console.log('Connected : ', message);
});

client.addListener('error', function(message) {
    console.log('error: ', message);
});

// Split the message and call the related function (if there is one)
function handle_msg(nick, chan, msg) {

  var msg_as_params = msg.split(" ");
  var func_name = msg_as_params.shift();
  var func = FUNCTIONS[func_name];

  if (func != null && func.action != null) {
    console.log("> "+ func_name + " " + nick + " " + msg_as_params.join(" "));
    func.action(nick, msg_as_params);
  }
}

function sendMsg(nick, msg){
      setTimeout(function(){ say_to_user(nick,msg); }, 5000);
}

// Builds and send msg to the user 
function buildMsgFromResponse(nick, sub, response){
  var user = USERS[nick];
  var options = user.options;
  var i = 0;
  var posts = response.data.children;
  var lastSeenId;

  // internal function used to delay iteration over posts and avoid flood kick
  var process = function(){
    setTimeout(function(){

     if(posts[i] != null && posts[i].data !=null){

	      var post = posts[i].data;
	      var title = "";
	      var content = "";
	      var url = "";
	      var mediaUrl = "";

	      // Get media data if any
	      var postMedia;
	      if (post.secure_media != null && post.secure_media.oembed != null) {
	        postMedia = post.secure_media.oembed;
	      } else if (post.media != null && post.media.oembed != null) {
	        postMedia = post.media.oembed;
	      } else {
	        postMedia = null;
	      }

	      if(options.showTitle) title = post.title + " : ";
	      if(options.showText) content += post.text + " - ";
	      if(options.showUrl) url = post.url+ " - ";
	      if(postMedia != null && options.showMediaUrl) mediaUrl = postMedia.url;

	      

	      var msg = title + content + url + mediaUrl + "\n";
	      say_to_user(nick,msg);

	      i++;
	      if(i<posts.length) process();
	      else{
	      	// We set the last seen entry for this subreddit in the subredditIndexes hash of the user
	        user.subredditIndexes[sub] = post.name;
	        user.locked = false;
	      } 
     }else{
     	say_to_user(nick, "no");
     }
      
      
    }, DELAY);

  }

  if(posts != null && Array.isArray(posts) && posts.length>0) process();
  else say_to_user(nick, "No posts for this subreddit");

/*  var lastPostID = posts[posts.length-1].data.name;
  user.subredditIndexes[sub] = lastPostID;*/


}

var util = require("util");


// Main method, used to browse the requested subreddit 
function browse(nick, params, more){

  initUser(nick);
  var user = USERS[nick];
  if(user.locked) return;
  user.locked = true;

  var subParam = params.shift();
  var sub = subParam != null ? subParam : user.lastSubreddit;

  if(sub == null) return;

	  // Send a ---- dotted line to split from previous content
	if(user.lastSubreddit != null && sub != user.lastSubreddit) 
	  say_to_user(nick,"\n ---------------------------------------------------- \n"); 

  // Continue browsing of a subreddit
  if(more == true && user.subredditIndexes[sub] != null) {

    var lastPostID = user.subredditIndexes[sub];
    console.log("Browsing more from "+sub+" after "+lastPostID);
    reddit.r(sub).from('all').after(lastPostID).limit(LIMIT, function(err, response, res){
      buildMsgFromResponse(nick, sub, response);
    });

    user.lastSubreddit = sub;

  }   

  // Init browsing in a new subreddit
  else{

    console.log("Browsing "+sub);
    reddit.r(sub).from('all').limit( LIMIT, function (err, response, res) {
      buildMsgFromResponse(nick, sub, response);
    });

    user.lastSubreddit = sub;
  }

}

// Build the User hash (in memory persisted)
function initUser(nick) {
  if (USERS[nick] == null) {
    USERS[nick] = {
      currentSubreddit: null,
      lastSubreddit: null,
      subredditIndexes : { },
      locked: false,
      options: {
        showScore: false,
        showText: false,
        showTitle: true,
        showUrl: true,
        showMediaUrl: false,
        showAuthor: false
      }
    };
  }
}


// Send a private message to a user
function say_to_user(nick,msg) {
  client.say(nick, msg);
}

// Send a message on a channel
function say_to_channel(channel, msg){
  client.say(channel, msg);
}

// Send a log message on the Main Channel
function echo(msg) {
  client.say(MAIN_CHANNEL, "[ "+msg+" ]");
}

// Dynamic help display (custom message + function descriptions)
function show_help(nick) {

  var str = " Hello, I'm a bot. Here are my commands : \n "
  var function_names = [];
  for(var fn in FUNCTIONS){ function_names.push(fn); }
  function_names.sort();

  for(var i = 0; i<function_names.length; i++){
    var name = function_names[i];
    var func = FUNCTIONS[name];
    if(func.description != null){ str+= " - "+name+" : "+func.description+"\n" }
  }

  say_to_user(nick, str);
}