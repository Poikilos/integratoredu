//index.js/
var express = require('express'),
    exphbs = require('express-handlebars'),
    logger = require('morgan'),
    moment = require('moment'),
    cookieParser = require('cookie-parser'),
    bodyParser = require('body-parser'),
    methodOverride = require('method-override'),
    session = require('express-session'),
    passport = require('passport'),
    LocalStrategy = require('passport-local'),
    yaml = require("node-yaml"),
	fs = require('fs');
//    TwitterStrategy = require('passport-twitter'),
//    GoogleStrategy = require('passport-google'),
//    FacebookStrategy = require('passport-facebook');

//We will be creating these two files shortly
var config = require('./config.js'), //config file contains all tokens and other private info
    funct = require('./functions.js'); //funct file contains our helper functions for our Passport and database work

var app = express();

var data_dir_name = "data";
var data_dir_path = data_dir_name;


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
passport.use('local-login', new LocalStrategy(
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
//Handlebars helpers added by Jake Gustafson

var prefill_enable = true;
var prefill_data = {};

// Configure express to use handlebars templates
var startTime = moment('08:10a', "HH:MM");
var endTime = moment('03:30p', "HH:MM");
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
		is_after_school: function(opts) {
			//if (Date.format("HH:MM:SS") > Date.parse("15:05:00"))
			var currentTime = moment(); //moment('11:00p', "HH:mm a");
			
			//if (moment().format('HH:MM:SS') );
			if (currentTime > endTime)
			    return opts.fn(this);
			else
				return opts.inverse(this);
		},
		show_time: function(opts) {
			//return "Time of last change: " + moment().format("HH:MM");
 			return moment().format("h:mm a") + " (will be updated on refresh or enter)";
		},
		prefill_first_name: function(opts) {
			if (prefill_data.first_name)
				return prefill_data.first_name
			else
				return "";
		},
		prefill_last_name: function(opts) {
			if (prefill_data.last_name)
				return prefill_data.last_name
			else
				return "";
		},
		prefill_picked_up_by: function(opts) {
			if (prefill_data.picked_up_by)
				return prefill_data.picked_up_by
			else
				return "";
		},
		prefill_grade_level: function(opts) {
			if (prefill_data.grade_level)
				return prefill_data.grade_level
			else
				return "";
		},
		prefill_family_id: function(opts) {
			if (prefill_data.family_id)
				return prefill_data.family_id
			else
				return "";
		},
    },
    defaultLayout: 'main', //we will be creating this layout shortly
});
//partialsDir can also be added as a param above for storing partial paths for portability (normally used to specify where handlebars files are stored)
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');

//Drkawashima on https://stackoverflow.com/questions/33979051/typeerror-handlebars-registerhelper-is-not-a-function-nodejs
//  says: "The object you get from require('express-handlebars') is not any 'plain old handlebars object'. It's a different object only used in express-handlebars
//    What you do is pass your helpers (and other settings as well) to the .create() function of that object."
//  so the following doesn't work:
//via https://www.youtube.com/watch?v=h3sAJXpCOdo
//NOTE: if helper is called via iterate, context and options are the params automatically created by handlebars, and contains fn, hash, and inverse (see https://www.youtube.com/watch?v=oezJZiFFPNU)
//exphbs.registerHelper('strcomp', function(haystack, needle){
//	return haystack==needle;
//});

//otherwise could do:
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
app.get('/login', function(req, res){
  res.render('login');
});

//sends the request through our local signup strategy, and if successful takes user to homepage, otherwise returns then to signin page
app.post('/local-reg', passport.authenticate('local-signup', {
  successRedirect: '/sign',
  failureRedirect: '/sign/login'
  })
);

function show_notice(msg) {
	//NOTE: does nothing since no req
	req.session.notice = msg;
}

app.post('/sign-student', function(req, res){
	//req is request, res is response
	//if using qs, student sign in/out form subscript fields can be created in html template, then accessed here via dot notation: family_id first_name last_name grade (time is calculated here)
	prefill_data.time_string = moment().format("HH:MM");
	prefill_data.family_id = req.body.student_family_id.trim();
	prefill_data.first_name = req.body.student_first_name.trim();
	prefill_data.last_name = req.body.student_last_name.trim();
	prefill_data.grade_level = req.body.student_grade_level.trim();
	prefill_data.picked_up_by = req.body.student_picked_up_by.trim();
	
	if (prefill_data.first_name) {
		if (prefill_data.last_name) {
			if (prefill_data.picked_up_by) {
				if (prefill_data.grade_level) {
					//console.log(req.body.student_family_id);
					var student = {first_name:prefill_data.first_name, last_name:prefill_data.last_name, family_id:prefill_data.family_id, grade:prefill_data.grade_level, time:prefill_data.time_string, picked_up_by:prefill_data.picked_up_by};
					if (!fs.existsSync(data_dir_path))
						fs.mkdirSync(data_dir_path);
					var signs_dir_name = "extcare_events";
					var signs_dir_path = data_dir_path + "/" + signs_dir_name;
					if (!fs.existsSync(signs_dir_path))
						fs.mkdirSync(signs_dir_path);
					var y_dir_name = moment().format("YYYY");
					var y_dir_path = signs_dir_path + "/" + y_dir_name;
					if (!fs.existsSync(y_dir_path))
						fs.mkdirSync(y_dir_path);
					var m_dir_name = moment().format("MM");
					var m_dir_path = y_dir_path + "/" + m_dir_name;
					if (!fs.existsSync(m_dir_path))
						fs.mkdirSync(m_dir_path);
					var d_dir_name = moment().format("DD");
					var d_dir_path = m_dir_path + "/" + d_dir_name;
					if (!fs.existsSync(d_dir_path))
						fs.mkdirSync(d_dir_path);
					var dated_path = d_dir_path;
					var out_name = moment().format("HHMMSS") + ".yml";
					var out_path = dated_path + "/" + out_name;
					//this callback doesn't work:
					//yaml.write(out_path, student, "utf8", show_notice);
					yaml.writeSync(out_path, student, "utf8");
					req.session.notice = "Saved " + out_path + ".";
					prefill_enable = false;
					delete prefill_data.time_string;
					delete prefill_data.family_id;
					delete prefill_data.first_name;
					delete prefill_data.last_name;
					delete prefill_data.grade_level;
					delete prefill_data.picked_up_by;
				}
				else {
					req.session.error = "Missing 'Grade'";
				}
			}
			else {
				req.session.error = "Missing 'picked up by'";
			}
		}
		else {
			req.session.error = "Missing 'student last name'";
		}
	}
	else {
		req.session.error = "Missing 'student first name'";
	}
	res.redirect('/sign');
});

//sends the request through our local login/signin strategy, and if successful takes user to homepage, otherwise returns then to signin page
app.post('/login', passport.authenticate('local-login', {
  successRedirect: '/sign',
  failureRedirect: '/sign/login'
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
