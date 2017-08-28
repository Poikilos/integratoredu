//index.js/
var express = require('express'),
    exphbs = require('express-handlebars'),
    logger = require('morgan'),
    cookieParser = require('cookie-parser'),
    bodyParser = require('body-parser'),
    methodOverride = require('method-override'),
    session = require('express-session'),
    passport = require('passport'),
    LocalStrategy = require('passport-local');
//    TwitterStrategy = require('passport-twitter'),
//    GoogleStrategy = require('passport-google'),
//    FacebookStrategy = require('passport-facebook');

//We will be creating these two files shortly
var config = require('./config.js'), //config file contains all tokens and other private info
    funct = require('./functions.js'); //funct file contains our helper functions for our Passport and database work

var app = express();


//===============PASSPORT===============

// Passport session setup.
passport.serializeUser(function(user, done) {
  console.log("serializing " + user.username);
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  console.log("deserializing " + obj);
  done(null, obj);
});

// Use the LocalStrategy within Passport to login/"signin" users.
passport.use('local-signin', new LocalStrategy(
  {passReqToCallback : true}, //allows us to pass back the request to the callback
  function(req, username, password, done) {
    funct.localAuth(username, password)
    .then(function (user) {
      if (user) {
        console.log("LOGGED IN AS: " + user.username);
        req.session.success = 'You are successfully logged in ' + user.username + '!';
        done(null, user);
      }
      if (!user) {
        console.log("COULD NOT LOG IN");
        req.session.error = 'Could not log user in. Please try again.'; //inform user could not log them in
        done(null, user);
      }
    })
    .fail(function (err){
      console.log(err.body);
    });
  }
));
// Use the LocalStrategy within Passport to register/"signup" users.
passport.use('local-signup', new LocalStrategy(
  {passReqToCallback : true}, //allows us to pass back the request to the callback
  function(req, username, password, done) {
    funct.localReg(username, password)
    .then(function (user) {
      if (user) {
        console.log("REGISTERED: " + user.username);
        req.session.success = 'You are successfully registered and logged in ' + user.username + '!';
        done(null, user);
      }
      if (!user) {
        console.log("COULD NOT REGISTER");
        req.session.error = 'That username is already in use, please try a different one.'; //inform user could not log them in
        done(null, user);
      }
    })
    .fail(function (err){
      console.log(err.body);
    });
  }
));

//===============EXPRESS================
// Configure Express
app.use(logger('combined'));
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(methodOverride('X-HTTP-Method-Override'));
app.use(session({secret: 'supernova', saveUninitialized: true, resave: true}));
app.use(passport.initialize());
app.use(passport.session());

// Session-persisted message middleware
app.use(function(req, res, next){
  var err = req.session.error,
      msg = req.session.notice,
      success = req.session.success;

  delete req.session.error;
  delete req.session.success;
  delete req.session.notice;

  if (err) res.locals.error = err;
  if (msg) res.locals.notice = msg;
  if (success) res.locals.success = success;

  next();
});

//NOTE: direct use of handlebars object is not possible after created since:
//"It's important to note you're using express-handlebars, which is a plugin to allow using handlebars as a view engine in express. So the object you get from require('express-handlebars') won't be a Handlebars instance." - Tom Jardine-McNamara  on https://stackoverflow.com/questions/38488939/handlebars-registerhelper-error-registerhelper-is-not-a-function

// Configure express to use handlebars templates
var hbs = exphbs.create({
	 helpers: {
        sayHello: function () { alert("Hello") },
        getStringifiedJson: function (value) {
            return JSON.stringify(value);
        },
		if_eq: function(a, b, opts) {
			//console.log("checking if_eq while user is " + a);
			if (a == b) // Or === 
			    return opts.fn(this);
			else
				return opts.inverse(this);
		},
		is_after_school: function(a, b, opts) {
			if (a == b) // Or === 
			    return opts.fn(this);
			else
				return opts.inverse(this);
		},
		
    },
    defaultLayout: 'main', //we will be creating this layout shortly
});
//partialsDir can also be added as a param above for storing partial paths for portability (normally used to specify where handlebars files are stored)
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');

//Handlebars helpers added by Jake Gustafson
//Drkawashima on https://stackoverflow.com/questions/33979051/typeerror-handlebars-registerhelper-is-not-a-function-nodejs
//  says: "The object you get from require('express-handlebars') is not any 'plain old handlebars object'. It's a different object only used in express-handlebars
//    What you do is pass your helpers (and other settings as well) to the .create() function of that object."
//  so the following doesn't work:
//via https://www.youtube.com/watch?v=h3sAJXpCOdo
//NOTE: if helper is called via iterate, context and options are the params automatically created by handlebars, and contains fn, hash, and inverse (see https://www.youtube.com/watch?v=oezJZiFFPNU)
//exphbs.registerHelper('strcomp', function(haystack, needle){
//	return haystack==needle;
//});

//or like:
//hbs = require("hbs");
//hbs.registerHelper('plusone', (val,opts))=>{
//	return val + 1;
//});
//use like: {{plusone @index}}

//===============ROUTES===============

//displays our homepage
app.get('/', function(req, res){
  res.render('home', {user: req.user});
});

//displays our signup page
app.get('/signin', function(req, res){
  res.render('signin');
});

//sends the request through our local signup strategy, and if successful takes user to homepage, otherwise returns then to signin page
app.post('/local-reg', passport.authenticate('local-signup', {
  successRedirect: '/sign',
  failureRedirect: '/sign/signin'
  })
);

//sends the request through our local login/signin strategy, and if successful takes user to homepage, otherwise returns then to signin page
app.post('/login', passport.authenticate('local-signin', {
  successRedirect: '/sign',
  failureRedirect: '/sign/signin'
  })
);

//logs user out of site, deleting them from the session, and returns to homepage
app.get('/logout', function(req, res){
  var name = req.user.username;
  console.log("LOGGING OUT " + req.user.username)
  req.logout();
  res.redirect('/sign');
  req.session.notice = "You have successfully been logged out " + name + "!";
});

//===============PORT=================
var port = process.env.PORT || 8080; //select your port or let it pull from your .env file
app.listen(port);
console.log("listening on " + port + "!");
