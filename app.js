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

// "A polyfill is a script you can use to ensure that any browser will have an implementation of something you're using" -- FireSBurnsmuP Sep 20 '16 at 13:39 on https://stackoverflow.com/questions/7378228/check-if-an-element-is-present-in-an-array
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/includes
// https://tc39.github.io/ecma262/#sec-array.prototype.includes
if (!Array.prototype.includes) { //if browser doesn't support ECMA 2016
  Object.defineProperty(Array.prototype, 'includes', {
    value: function(searchElement, fromIndex) {
      if (this == null) {
        throw new TypeError('"this" is null or not defined');
      }
      var o = Object(this);
      var len = o.length >>> 0;
      if (len === 0) {
        return false;
      }
      var n = fromIndex | 0;
      var k = Math.max(n >= 0 ? n : len - Math.abs(n), 0);
      function sameValueZero(x, y) {
        return x === y || (typeof x === 'number' && typeof y === 'number' && isNaN(x) && isNaN(y));
      }
      while (k < len) {
        if (sameValueZero(o[k], searchElement)) {
          return true;
        }
        k++;
      }
      return false;
    }
  });
}
    
//We will be creating these two files shortly
var config = require('./config.js'), //config file contains all tokens and other private info
    funct = require('./functions.js'); //funct file contains our helper functions for our Passport and database work

var app = express();

if (!config.proxy_prefix_then_slash) proxy_prefix_with_slash = "/";

var data_dir_name = "data";
var data_dir_path = data_dir_name;

//var prefill_enable = true;
var prefill_data = {};
var groups = {};
//Any usernames added to groups via code should be created (using the create username form while web app is running) before web app is made accessible to anyone other than those setting up the web app.
groups["student-microevent"] = ["care", "commute"];
groups["care"] = ["care"];
groups["commute"] = ["commute"];
groups["accounting"] = ["accounting"];
groups["admin"] = ["admin"];
groups["attendance"] = ["attendance"];

var group_required_fields = {};
group_required_fields["care"] = ["first_name", "last_name", "chaperone", "grade_level"];
group_required_fields["commute"] = ["name", "grade_level", "heading", "reason"];

var group_form_fields = {};
group_form_fields["care"] = ["first_name", "last_name", "chaperone", "grade_level", "family_id", "stated_time"];
group_form_fields["commute"] = ["name", "grade_level", "heading", "reason", "stated_time", "pin"];

var never_save_fields = ["pin", "password", "transaction_type"];

//function by eyelidlessness on <https://stackoverflow.com/questions/1181575/determine-whether-an-array-contains-a-value> 5 Jan 2016. 31 Aug 2017. 
//var contains = function(needle) {
var contains = function(needle) {
    // Per spec, the way to identify NaN is that it is not equal to itself
    var findNaN = needle !== needle;
    var indexOf;

    if(!findNaN && typeof Array.prototype.indexOf === 'function') {
        indexOf = Array.prototype.indexOf;
    } else {
        indexOf = function(needle) {
            var i = -1, index = -1;

            for(i = 0; i < this.length; i++) {
                var item = this[i];

                if((findNaN && item !== item) || item === needle) {
                    index = i;
                    break;
                }
            }

            return index;
        };
    }

    return indexOf.call(this, needle) > -1;
};
//used like:
//var myArray = [0,1,2];
//var result = contains.call(myArray, needle); // true

//===============PASSPORT===============

// Passport session setup.
passport.serializeUser(function(user, done) {
  console.log("* passport serializing " + user.username);
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  console.log("* passport deserializing " + obj);
  done(null, obj);
});

// Use the LocalStrategy within Passport to login/"signin" users.
passport.use('local-login', new LocalStrategy(
  {passReqToCallback : true}, //allows us to pass back the request to the callback
  function(req, username, password, done) {
    funct.localAuth(username, password)
    .then(function (user) {
      if (user) {
        console.log("* LOGGED IN AS: " + user.username);
        //req.session.success = 'You are successfully logged in ' + user.username + '!';
        done(null, user);
      }
      if (!user) {
        console.log("* COULD NOT LOG IN");
        req.session.error = 'Could not log user in. Please try again.'; //inform user could not log them in
        done(null, user);
      }
    })
    .fail(function (err){
      console.log("* FAILED during login: " err.body);
    });
  }
));
// Use the LocalStrategy within Passport to register/"signup" users.
passport.use('local-signup', new LocalStrategy(
  {passReqToCallback : true}, //allows us to pass back the request to the callback
  function(req, username, password, done) {
    if (password) {
        if (username) {
            if ( req.body.pin && (req.body.pin==config.it_pin)) {
                funct.localReg(username, password)
                .then(function (user) {
                    if (!user) {
                    console.log("* COULD NOT REGISTER");
                    req.session.error = 'That username is already in use, please try a different one.'; //inform user could not log them in
                    done(null, user);
                    }
                    else {//if (user) {
                    console.log("* REGISTERED: " + user.username);
                    req.session.success = 'You are successfully registered and logged in ' + user.username + '!';
                    done(null, user);
                    }
                })
                .fail(function (err){
                    console.log("* FAILED during register:");
                    console.log("  " + err.body);
                    req.session.error = err.body;
                    done(null, null);
                });
            
            }
            else {
                req.session.error = "INCORRECT PIN: Special pin required for adding users. Please contact IT Department.";
                done(null, null);
            }
        }
        else {
            req.session.error = "MISSING: username";
            done(null, null);
        }
    }
    else {
        req.session.error = "MISSING: password";
        done(null, null);
    }
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

// Configure express to use handlebars templates
var startTime = moment('08:10', "HH:mm").format("HH:mm");
var endTime = moment('15:30', "HH:mm").format("HH:mm");
var hbs = exphbs.create({
	 helpers: {
        sayHello: function () { alert("Hello") },
        getStringifiedJson: function (value) {
            return JSON.stringify(value);
        },
		if_eq: function(a, b, opts) {
			//console.log("* checking if_eq while user is " + a);
			if (a == b) // Or === 
			    return opts.fn(this);
			else
				return opts.inverse(this);
		},
		groupContains: function(haystack, needle, opts) {
			if (contains.call(groups[haystack], needle))
				return opts.fn(this);
			else
				return opts.inverse(this);
		},
		is_after_school: function(opts) {
			//if (Date.format("HH:mm:ss") > Date.parse("15:05:00"))
			var currentTime = moment().format("HH:mm"); //moment('11:00p', "HH:mm a");
			
			//if (moment().format('HH:mm:ss') );
			if (currentTime > endTime) {
                //console.log(currentTime + " > " + endTime);
			    return opts.fn(this);
            }
			else {
                //console.log(currentTime + " <= " + endTime);
				return opts.inverse(this);
            }
		},
		show_time: function(opts) {
			//return "Time of last change: " + moment().format("HH:mm");
 			//return moment().format("h:mm a") + " (will be updated on refresh or enter)";
            return "";
		},
		prefill_form_field: function(fieldname, opts) {
			if (fieldname in prefill_data)
				return fieldname["prefill_data"]
			else
				return "";
		},
		prefill_name: function(opts) {
			if (prefill_data.name)
				return prefill_data.name
			else
				return "";
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
		prefill_reason: function(opts) {
			if (prefill_data.reason)
				return prefill_data.reason
			else
				return "";
		},
		prefill_chaperone: function(opts) {
			if (prefill_data.chaperone)
				return prefill_data.chaperone
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
		prefill_stated_time: function(opts) {
			if (prefill_data.stated_time)
				return prefill_data.stated_time
			else
				return "";
		},
		get_proxy_prefix_then_slash: function(opts) {
			if (config.proxy_prefix_then_slash.trim())
				return config.proxy_prefix_then_slash.trim();
			else
				return "/";
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
  successRedirect: config.proxy_prefix_then_slash,
  failureRedirect: config.proxy_prefix_then_slash  + 'login'
  })
);

//function show_notice(msg) {
	//NOTE: does nothing since don't have req
//	req.session.notice = msg;
//}

function is_not_blank(str) {
	return str && str.trim();
}

app.post('/student-microevent', function(req, res){
	//req is request, res is response
    if (("user" in req) && ("username" in req.user) ) {
        console.log("* student-microevent by " + req.user.username);
        //if using qs, student sign in/out form subscript fields can be created in html template, then accessed here via dot notation: family_id first_name last_name grade (time is calculated here)
        prefill_data.time = moment().format('HH:mm:ss')
        prefill_data.ctime = moment().format('YYYY-MM-DD HH:mm:ss Z')
        if (is_not_blank(req.body.stated_time)) prefill_data.stated_time = req.body.stated_time.trim();
        else {
            delete prefill_data.stated_time;
        }
        //else prefill_data.stated_time = moment().format("HH:mm:ss");
        
        //if (("family_id" in req.body) ) prefill_data.family_id = req.body.family_id.trim();
        //if ("first_name" in req.body) prefill_data.first_name = req.body.first_name.trim();
        //if ("last_name" in req.body) prefill_data.last_name = req.body.last_name.trim();
        //if ("grade_level" in req.body) prefill_data.grade_level = req.body.grade_level.trim();
        //if ("chaperone" in req.body) prefill_data.chaperone = req.body.chaperone.trim();
        //if ("reason" in req.body) prefill_data.reason = req.body.reason.trim();
        var record = {};
        var custom_error = null;
        var missing_fields = "";
        if (req.body.transaction_type in group_form_fields) {
            for (var index in group_form_fields[req.body.transaction_type]) {
                if (group_form_fields[req.body.transaction_type].hasOwnProperty(index)) {
                    var key = group_form_fields[req.body.transaction_type][index];
                    if (key in req.body) {
                        if (req.body[key]) {
                            prefill_data[key] = req.body[key];
                            if (!never_save_fields.includes(key)) record[key] = req.body[key];
                            //console.log(key + " is filled in");
                        }
                        //console.log(key + " is in body");
                    }
                    //else
                    //    console.log(key + " is in body");
                }
            }
        }
        else {
            custom_error = "unknown transaction_type '" + req.body.transaction_type + "'";
        }
        if (req.body.transaction_type in group_required_fields) {
            for (var index in group_required_fields[req.body.transaction_type]) {
                if (group_required_fields[req.body.transaction_type].hasOwnProperty(index)) {
                    var key = group_required_fields[req.body.transaction_type][index];
                    if (!(key in prefill_data)) {
                        custom_error = "MISSING: ";
                        if (missing_fields!="") missing_fields += ","
                        missing_fields += " " + key;
                    }
                    //else {
                     //   console.log(key + " is in prefill_data");
                    //}
                }
            }
        }
        else {
            console.log("WARNING: no required fields are specified for transaction_type '" + req.body.transaction_type + "'.");
            custom_error = "unknown transaction_type '" + req.body.transaction_type + "'";
        }
        
        //console.log(req.body.family_id);
        if (!custom_error) {
            if ("name" in prefill_data) record.name=prefill_data.name;
            if ("first_name" in prefill_data) record.first_name=prefill_data.first_name;
            if ("last_name" in prefill_data) record.last_name=prefill_data.last_name;
            if ("chaperone" in prefill_data) record.chaperone=prefill_data.chaperone;
            record.grade_level=prefill_data.grade_level;
            if ("family_id" in prefill_data) record.family_id=prefill_data.family_id;
            //var uac_error = null;
            if ("stated_time" in prefill_data) {
                if (prefill_data.stated_time.toLowerCase().match("am")
                    || prefill_data.stated_time.toLowerCase().match("pm") ) {
                    if (  (req.body.transaction_type=="commute")  &&  ( (!req.body.pin) || (req.body.pin!=config.office_pin))  ) {
                        custom_error="INCORRECT PIN: To use custom time, office must enter the correct pin (otherwise leave time blank for current).";
                        if (!config.office_pin) custom_error = custom_error + "; website administrator has not yet set office_pin in config.json";
                        custom_error = custom_error + ".";
                    }
                }
                else {
                    custom_error="MISSING: AM or PM is required for custom time";
                    //custom_error="MISSING: ";
                    //missing_fields += " " + "AM or PM is required for custom time";
                }
            }
            if (!custom_error) {
                record.ctime=prefill_data.ctime;
                record.time=prefill_data.time;
                //unique ones are below
                if (!fs.existsSync(data_dir_path))
                    fs.mkdirSync(data_dir_path);
                var signs_dir_name = null;
                if (contains.call(groups[req.body.transaction_type],req.user.username)) {
                    signs_dir_name = req.body.transaction_type;
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
                    var out_time_string = moment().format("HHmmss");
                    var out_name = out_time_string + ".yml";
                    var out_path = dated_path + "/" + out_name;
                    //this callback doesn't work:
                    //yaml.write(out_path, record, "utf8", show_notice);
                    record.created_by = req.user.username;
                    yaml.writeSync(out_path, record, "utf8");
                    var msg = "Saved entry for "+out_time_string.substring(0,2) + ":" + out_time_string.substring(2,4) + ":" + out_time_string.substring(4,6);
                    if (record.stated_time) msg = msg + " (stated time " + record.stated_time + ")";
                    req.session.notice = msg; //+"<!--" + out_path + "-->.";
                    //prefill_enable = false;
                    
                    //delete prefill_data.time;
                    //delete prefill_data.family_id;
                    //delete prefill_data.first_name;
                    //delete prefill_data.last_name;
                    //delete prefill_data.grade_level;
                    //delete prefill_data.chaperone;
                    //delete prefill_data.reason;
                    //delete prefill_data.time;
                    //delete prefill_data.ctime;
                    //delete prefill_data.stated_time;
                    for (var member in prefill_data) delete prefill_data[member];
                }
                else {
                    req.session.error = "not authorized to modify data for '" + req.body.transaction_type + "'";
                    delete prefill_data.pin;
                    delete prefill_data.heading;
                }
            }
            else {
                req.session.error = custom_error;
                delete prefill_data.pin;
                delete prefill_data.heading;
            }
        }
        else {
            delete prefill_data.pin;
            delete prefill_data.heading;
            req.session.error = custom_error + missing_fields;
        }
    }
    else {
        for (var member in prefill_data) delete prefill_data[member];
        req.session.error = "The server was reset so you must log in again. Sorry for the inconvenience.";
    }
	res.redirect(config.proxy_prefix_then_slash);
});

//sends the request through our local login/signin strategy, and if successful takes user to homepage, otherwise returns then to signin page
app.post('/login', passport.authenticate('local-login', {
  successRedirect: config.proxy_prefix_then_slash,
  failureRedirect: config.proxy_prefix_then_slash + 'login'
  })
);

//logs user out of site, deleting them from the session, and returns to homepage
app.get('/logout', function(req, res){
  var name = req.user.username;
  console.log("LOGGING OUT " + req.user.username)
  req.logout();
  res.redirect(config.proxy_prefix_then_slash);
  req.session.notice = "You have successfully been logged out " + name + "!";
});

//===============PORT=================
var port = process.env.PORT || 8080; //select your port or let it pull from your .env file
app.listen(port);
console.log("listening on " + port + "!");
