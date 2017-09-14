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
var path = require("path");
var basePath = "./";

var dat;
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
var groups = {}; //which users can write to the section
//Any usernames added to groups via code should be created (using the create username form while web app is running) before web app is made accessible to anyone other than those setting up the web app.
groups["student-microevent"] = ["care", "commute", "admin"];
groups["care"] = ["care", "admin"];
groups["commute"] = ["commute", "admin"];
groups["accounting"] = ["accounting", "admin"];
groups["admin"] = ["admin"];
groups["attendance"] = ["attendance", "admin"];

var read_groups = {}; //which users can read all data from the section
//care should see care info (who has logged in or out of care so far), but commute user (students) should not see other commutes:
read_groups["care"] = ["accounting", "admin", "care"];
read_groups["commute"] = ["attendance", "admin"];

var group_required_fields = {};
group_required_fields["care"] = ["first_name", "last_name", "chaperone", "grade_level"];
group_required_fields["commute"] = ["name", "grade_level", "heading", "reason"];

var group_form_fields = {};
group_form_fields["care"] = ["first_name", "last_name", "chaperone", "grade_level", "family_id", "stated_time"];
group_form_fields["commute"] = ["name", "grade_level", "heading", "reason", "stated_time", "pin"];

var group_sheet_fields = {};
group_sheet_fields["care"] = [".get_date()", "time", "first name", "last_name", "grade_level", "family_id", "chaperone"]
group_sheet_fields["commute"] = [".get_date()", "time", "", "grade_level"]

var group_sheet_fields_names = {};
group_sheet_fields_names["care"] = {};
group_sheet_fields_names["care"]["time"] = "Time";
group_sheet_fields_names["care"][".get_date()"] = "Date";

var group_fields_overrides = {};
group_fields_overrides["care"] = {};
group_fields_overrides["care"]["time"] = "stated_time";
group_fields_overrides["commute"] = {};
group_fields_overrides["commute"]["time"] = "stated_time";

var fields_friendly_names = {};
//fields_friendly_names["heading"] = "select arriving/departing";

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
      console.log("* FAILED during login: " + err.body);
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
			if (user.error) {
				req.session.error = user.error;
				done(null, null); //2nd param null means don't log in!
			}
			else {
				console.log("* REGISTERED: " + user.username);
				req.session.success = 'You are successfully registered and logged in ' + user.username + '!';
				done(null, user);
			}
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
        get_tz_offset_mins: function(opts) {
            return moment().utcOffset();
        },
        get_session_field: function(fieldname, opts) {
            return session[fieldname];  // DOESN'T WORK
        },
        get_session_field_section: function(opts) {
            return session.section;  // DOESN'T WORK
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

//from Titlacauan on https://stackoverflow.com/questions/18112204/get-all-directories-within-directory-nodejs
function getDirectories(path) {
  return fs.readdirSync(path).filter(function (file) {
    return fs.statSync(path+'/'+file).isDirectory();
  });
}

function getFiles(path) {
  return fs.readdirSync(path).filter(function (file) {
    return !fs.statSync(path+'/'+file).isDirectory();
  });
}

//===============ROUTES===============

//keep track of last listing (only refresh if data could have possibly changed naturally):
var listed_year_on_month = null;
var listed_month_on_date = null;
var listed_day_on_date = null;

//displays our homepage
app.get('/', function(req, res){
	console.log("");
	var sections = [];
	var years = [];
	var months = [];
	var days = [];
    var item_keys = []; // the associative array keys for accessing objects in the day
    var items = []; //the entries
	var section = null; //selected section
	var selected_month = null;
	var selected_year = null;
	var selected_day = null;
	var selected_item_key = null;
	if (req.user && req.user.username) {
		preload_table_names = ["care","commute"];
		for (var index in preload_table_names) {
			if (preload_table_names.hasOwnProperty(index)) {
				var val = preload_table_names[index];
				if (contains.call(read_groups[val], req.user.username)) {
					sections.push(val);
				}
		// 		table_path = data_dir_path + "/" + val;
		// 		if (fs.existsSync(table_path)) {
		// 			var y_dir_name = moment().format("YYYY");
		// 			var m_dir_name = moment().format("MM");
		// 			var d_dir_name = moment().format("DD");
		// 			dat[val] = {};
		// 		}
			}
		}
	}
	if (is_not_blank(req.query.section)) {
		section = req.query.section;
	}
	else if (is_not_blank(req.session.section)) {
		section = req.session.section;
	}
	if (req.query.selected_year) {
		selected_year = req.query.selected_year;
        if (selected_year = "(none)") selected_year = null;
        req.session.selected_year = selected_year;
	}
	else if (req.session.selected_year) {
		selected_year = req.session.selected_year;
	}
	if (req.query.selected_month) {
		selected_month = req.query.selected_month;
        if (selected_month=="(none)") selected_month = null;
        req.session.selected_month = selected_month;
	}
	else if (req.session.selected_month) {
		selected_month = req.session.selected_month;
	}
	//console.log("req.query.selected_month:"+req.query.selected_month);
	//console.log("req.session.selected_month:"+req.session.selected_month);
	//console.log("selected_month:"+selected_month);
	if (req.query.selected_day) {
		selected_day = req.query.selected_day;
        if (selected_day=="(none)") selected_day = null;
        req.session.selected_day = selected_day;
	}
	else if (req.session.selected_day) {
		selected_day = req.session.selected_day;
	}
	//console.log("req.query.selected_day:"+req.query.selected_day);
	//console.log("req.session.selected_day:"+req.session.selected_day);
	//console.log("selected_day:"+selected_day);
	if (req.query.selected_item_key) {
		selected_item_key = req.query.selected_item_key;
        if (selected_item_key=="(none)") selected_item_key = null;
        req.session.selected_item_key = selected_item_key;
	}
	else if (req.session.selected_item_key) {
		selected_item_key = req.session.selected_item_key;
	}
	if (section) {
		req.session.section = section;
		if (req.user && req.user.username) {
			if (contains.call(read_groups[section], req.user.username)) {
				var y_dir_name = moment().format("YYYY");
				var m_dir_name = moment().format("MM");
				var d_dir_name = moment().format("DD");
				var year_month_string = moment().format("YYYY-MM");
				var date_string = moment().format("YYYY-MM-DD");
				if (!dat) {
					dat = {};
				}
				table_path = data_dir_path + "/" + section;
				if (!(dat[section]&&dat[section]["years"]) || !listed_year_on_month || (listed_year_on_month!=year_month_string)) {
					listed_year_on_month = year_month_string;
					if (fs.existsSync(table_path)) {
						if (!dat[section]) dat[section] = {};
						years = getDirectories(table_path);
						dat[section]["years"] = years;
						//for (var y_i = 0; y_i < years.length; y_i++) {
							//var this_year = years[y_i];
							//dat[section][this_year] = {};
						//}
					}
				}
				else years = dat[section]["years"];
                if (years.length==1) {
                    selected_year = years[0];
                    req.session.selected_year = selected_year;
                    if (!selected_year) console.log("ERROR: blanked out on year (cache fail)");
                }
                if (!years) {
                    console.log("WARNING: no years (no data or cache fail)");
                }
				if (selected_year) {
					var y_path = table_path + "/" + selected_year;
					if (fs.existsSync(y_path)) {
						if (!(dat[section][selected_year]&&dat[section][selected_year]["months"]) || !listed_month_on_date || (listed_month_on_date!=date_string) ) {
							listed_month_on_date = date_string;
							months = getDirectories(y_path);
							if (!dat[section][selected_year]) dat[section][selected_year] = {};
							dat[section][selected_year]["months"] = months;
							for (var m_i = 0; m_i < months.length; m_i++) {
								var this_month = months[m_i];
								//console.log("# FOUND MONTH "+this_month +" in "+y_path);
								dat[section][selected_year][this_month] = {};
							}
						}
						else {
							months = dat[section][selected_year]["months"];
							//console.log("(got cached months: "+funct.to_ecmascript_value(months));
						}
                        if (months.length==1) {
                            selected_month = months[0];
                            req.session.selected_month = selected_month;
                            //console.log("Auto selected_month "+selected_month);
                        }
						if (selected_month) {
							var m_path = y_path + "/" + selected_month;
							if (!(dat[section][selected_year][selected_month]&&dat[section][selected_year][selected_month]["days"])
									|| !listed_day_on_date || listed_day_on_date!=date_string) {
								listed_day_on_date=date_string;
								days = getDirectories(m_path);
								if (!dat[section][selected_year][selected_month]) dat[section][selected_year][selected_month]={};
								dat[section][selected_year][selected_month]["days"] = days;
                                for (var d_i = 0; d_i < days.length; d_i++) {
                                    var this_day = days[d_i];
                                    //console.log("this_day:"+this_day);
                                    dat[section][selected_year][selected_month][this_day] = {};
                                }
							}
							else days = dat[section][selected_year][selected_month]["days"];
                            if (days.length==1) {
                                selected_day = days[0];
                                req.session.selected_day = selected_day;
                                //console.log("     AUTO selected_day (key) ="+selected_day);
                            }
                            if (selected_day) {
                                var d_path = m_path + "/" + selected_day;
                                //if (!(dat[section][selected_year][selected_month][selected_day]&&dat[section][selected_year][selected_month][selected_day]["item_keys"])
                                //lists files every page load since modification not saved nor checked
                                
                                //subs = getDirectories(d_path);
								//NOTE: fs.readdir is ASYNC! use getFiles which uses fs.readdirsync
                                //fs.readdir(d_path, function(err, these_item_keys) {
								//these_item_keys = getFiles(d_path);
								//	for (var i=0; i<these_item_keys.length; i++) {
								//for (var i = 0; i < these_item_keys.length; i++) {
								//	var this_day = these_item_keys[i];
								//	//console.log(item_keys);
								//	item_keys.push(these_item_keys[i]);
                                //}
                                item_keys = getFiles(d_path);
                                
                                //for (var i=0; i<item_keys.length; i++) {
                                //    console.log("   * " + item_keys[i]);
                                //}
                                
                                if (!dat[section][selected_year][selected_month][selected_day]) dat[section][selected_year][selected_month][selected_day]={};
                                dat[section][selected_year][selected_month][selected_day]["item_keys"] = item_keys;
                                //console.log("## ITEM KEYS: "+funct.to_ecmascript_value(item_keys));
                                //console.log("(ITEM KEYS.length:"+item_keys.length+")");
								//console.log("## ITEMS:"+items);
                                //for (var item_key_i = 0; item_key_i < item_keys.length; item_key_i++) {
								for (var item_key_i in item_keys) {
                                    var item_key = item_keys[item_key_i];
									var item_path = d_path + "/" + item_key;
									//console.log("  - "+item_key);
                                    dat[section][selected_year][selected_month][selected_day][item_key] = {};
                                    dat[section][selected_year][selected_month][selected_day][item_key] = yaml.readSync(item_path, "utf8");
                                    dat[section][selected_year][selected_month][selected_day][item_key].key = item_key;
                                    //dat[section][selected_year][selected_month][selected_day][this_item] = yaml.readSync(item_path, "utf8");
									var this_item = dat[section][selected_year][selected_month][selected_day][item_key];
									items.push(this_item);
									for (var index in this_item) {
										if (this_item.hasOwnProperty(index)) {
											var val = this_item[index];
											//var val = items[index];
											//console.log("    " + index + ": " + val);
										}
									}
									
                                }
                                //TODO: find out why this doesn't work: items = dat[section][selected_year][selected_month][selected_day];
                                //for (var key_i = 0; key_i < items.length; key_i++) {
                                //    console.log("    * "+items[key_i]asdf (iterate object members)
                                //}
                            }
						}
					}
				}
			}
			else {
				var error_string = " has no permission for " + section;
				if (req.user && req.user.username) error_string = req.user.username + error_string;
				else error_string = "Unauthenticated user" + error_string;
				req.session.error = error_string;
			}
		}
		
	}
	res.render('home', {user: req.user, section: section, selected_year:selected_year, selected_month: selected_month, selected_day: selected_day, selected_item_key: selected_item_key, sections: sections, years: years, months: months, days: days, objects: items});
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
                        if (missing_fields!="") missing_fields += ",";
                        key_friendly_name = key;
                        if (fields_friendly_names.key) key_friendly_name = fields_friendly_names.key;
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
                record.time = moment().format('HH:mm:ss')
                record.ctime = moment().format('YYYY-MM-DD HH:mm:ss Z')
                record.tz_offset_mins = moment().utcOffset();
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
