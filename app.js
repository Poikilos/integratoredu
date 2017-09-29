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
var Handlebars = require('handlebars');
//Speech.init({
//    'onVoicesLoaded': (data) => {console.log('voices', data.voices)},
//    'lang': 'en-GB', // specify en-GB language (no detection applied)
//    'volume': 0.5,
//    'rate': 0.8,
//    'pitch': 0.8
//});
//if(Speech.browserSupport()) {
//    console.log("speech synthesis supported")
//}
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

var contains = {};
contains.call = function (haystack, needle) {
	//console.log("WARNING: contains.call is deprecated by integratoredu, so fun.contains.call (which is a reference to functions.js) should be used instead.");
	return fun.contains.call(haystack, needle);
}

//We will be creating these two files shortly
var config = require('./config.js'), //config file contains all tokens and other private info
    fun = require('./functions.js'); //functions file contains our non-app-specific functions including those for our Passport and database work

var app = express();
app.use(express.static(__dirname + '/public'));
//app.listen(8080);

if (!config.proxy_prefix_then_slash) config.proxy_prefix_then_slash = "/";
if (!("audio_enable" in config)) config.audio_enable = true;

var data_dir_name = "data";
var data_dir_path = data_dir_name;

var sections = ["care", "commute"];
var friendly_section_names = {"care":"Extended Care","commute":"Commute"};

var modes = ["create", "read", "modify"];
var transient_modes = ["modify"]; //modes only used during operation of other modes
var transient_modes_return = {};
transient_modes_return["modify"] = "read";

var friendly_mode_names = {};
friendly_mode_names["create"] = "Entry Form";
friendly_mode_names["read"] = "History";
friendly_mode_names["modify"] = "Edit";

var friendly_mode_action_text = {};
friendly_mode_action_text["create"] = "Enter";
friendly_mode_action_text["read"] = "Save"; //save button since read will show editable fields if user has write priv to the section
friendly_mode_action_text["modify"] = "Save";

var default_mode_by_user = {};
default_mode_by_user["care"] = "create";
default_mode_by_user["commute"] = "create";
default_mode_by_user["attendance"] = "read";
default_mode_by_user["accounting"] = "read";

var prefill_data_by_user = {};

var create_groups = {}; //which users can create entries in which section
//Any usernames added to groups via code should be created (using the create username form while web app is running) before web app is made accessible to anyone other than those setting up the web app.
//create_groups["student-microevent"] = ["care", "commute", "admin"];
create_groups["care"] = ["admin", "accounting", "care"];
create_groups["commute"] = ["admin", "attendance", "commute"];

var read_groups = {}; //which users can read all data from which section
//care should see care info (who has logged in or out of care so far) but NOT costs, but commute user (students) should not see other commutes:
read_groups["care"] = ["admin", "accounting", "care"];
read_groups["commute"] = ["admin", "attendance"];

var modify_groups = {}; //which users can modify existing data in which section
modify_groups["care"] = ["admin", "accounting"]
modify_groups["commute"] = ["admin", "attendance"]

var _pinless_custom_time_groups_by_section = {};
_pinless_custom_time_groups_by_section["care"] = ["admin", "care", "accounting"]; //allow these groups to enter a different time for care
_pinless_custom_time_groups_by_section["commute"] = ["admin", "attendance"]; //if part of one of these groups

function user_has_pinless_time(section, username) {
	var result = false;
	//for (var section_index in _pinless_custom_time_groups_by_section) {
	//	if (_pinless_custom_time_groups_by_section.hasOwnProperty(section_index)) {
			//var val = _pinless_custom_time_groups_by_section[section_index];
	//		if (username in _pinless_custom_time_groups_by_section[section_index]) {
	//			result = true;
	//			break;
	//		}
			//for (var group_index in _pinless_custom_time_groups_by_section[group_index]) {
			//	if (_pinless_custom_time_groups_by_section.hasOwnProperty(group_index)) {
			//		var val = _pinless_custom_time_groups_by_section[group_index];
			//	}
			//}
	//	}
	//}
	
	if (section in _pinless_custom_time_groups_by_section) {
		//for (var group_index in _pinless_custom_time_groups_by_section[section]) { //for (group in _pinless_custom_time_groups_by_section["section"]) {
			//var val = _pinless_custom_time_groups_by_section[section][group_index];
		//if (contains.call(_pinless_custom_time_groups_by_section[section][group_index], username)) {
		if (contains.call(_pinless_custom_time_groups_by_section[section], username)) {
			result = true;
		}
		//}
	}
	return result;
}

var section_required_fields = {};
section_required_fields["care"] = ["first_name", "last_name", "chaperone", "grade_level"];
section_required_fields["commute"] = ["name", "grade_level", "heading", "reason"];

var section_form_fields = {};
section_form_fields["care"] = ["first_name", "last_name", "chaperone", "grade_level", "family_id", "stated_time", "stated_date"];
section_form_fields["commute"] = ["name", "grade_level", "heading", "reason", "stated_time", "stated_date", "pin"];

var choices_by_field = {};
choices_by_field["heading"] = ["in", "out"]

var section_form_collapsed_fields = {};
section_form_collapsed_fields["care"] = ["family_id", "stated_time", "stated_date"];
section_form_collapsed_fields["commute"] = ["stated_time", "stated_date", "pin"];

var section_form_friendly_names = {};
section_form_friendly_names["care"] = {};
section_form_friendly_names["care"]["first_name"] = "Student First Name";
section_form_friendly_names["care"]["last_name"] = "Student Last Name";
section_form_friendly_names["care"]["chaperone"] = "Pickup/Dropoff By";
section_form_friendly_names["care"]["grade_level"] = "Grade";
section_form_friendly_names["care"]["stated_time"] = "Time (blank for auto, otherwise specify AM or PM)";
section_form_friendly_names["care"]["stated_date"] = "Date (blank for auto, otherwise must be in MM/DD/YYYY format)";
section_form_friendly_names["care"]["family_id"] = "Family ID (if applicable)";
section_form_friendly_names["care"]["pin"] = "override pin";
section_form_friendly_names["commute"] = {};
section_form_friendly_names["commute"]["name"] = "Name";
section_form_friendly_names["commute"]["grade_level"] = "Grade";
section_form_friendly_names["commute"]["heading"] = "Heading";
section_form_friendly_names["commute"]["reason"] = "Reason";
section_form_friendly_names["commute"]["stated_time"] = "Custom Time (blank for auto, otherwise specify AM or PM)";
section_form_friendly_names["commute"]["stated_date"] = "Custom Date (blank for auto, otherwise must be in MM/DD/YYYY format)";
section_form_friendly_names["commute"]["pin"] = "override pin";

var section_sheet_fields = {};
section_sheet_fields["care"] = ["=get_date_from_path()", "time", "first_name", "last_name", "grade_level", "family_id", "chaperone", "modified_by"]
section_sheet_fields["commute"] = ["=get_date_from_path()", "time", "name", "grade_level"]

var section_sheet_fields_friendly_names = {}
section_sheet_fields_friendly_names["care"] = {}
section_sheet_fields_friendly_names["care"]["=get_date_from_path()"] = "Date";
section_sheet_fields_friendly_names["care"]["first_name"] = "First";
section_sheet_fields_friendly_names["care"]["last_name"] = "Last";
section_sheet_fields_friendly_names["care"]["grade_level"] = "Grade Level";
section_sheet_fields_friendly_names["commute"] = {}
section_sheet_fields_friendly_names["commute"]["=get_date_from_path()"] = "Date";
section_sheet_fields_friendly_names["commute"]["grade_level"] = "Grade Level";


var section_sheet_fields_names = {};
section_sheet_fields_names["care"] = {};
section_sheet_fields_names["care"]["time"] = "Time";
section_sheet_fields_names["care"]["=get_date_from_path()"] = "Date";

//used for spreadsheet view/export (such as: change time to stated_time if stated_time was specified by user)
var section_fields_overrides = {};
section_fields_overrides["care"] = {};
section_fields_overrides["care"]["time"] = "stated_time";
section_fields_overrides["care"]["date"] = "stated_date";
section_fields_overrides["commute"] = {};
section_fields_overrides["commute"]["time"] = "stated_time";
section_fields_overrides["commute"]["date"] = "stated_date";

var fields_friendly_names = {};
//fields_friendly_names["heading"] = "select arriving/departing";

var never_save_fields = ["pin", "password", "section", "mode"]; //and formerly "transaction_section"

//these variables are not security groups--they only determine where to display security warning that only employees should be given the rights to current section
var only_employee_read_sections = ["commute"]; //NOTE: do not include care, since care (non-employee) user is allowed to list attendance
var only_employee_modify_sections = ["commute", "care"]; 


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
    fun.localAuth(username, password)
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
                fun.localReg(username, password)
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

function create_group_contains(section, username) {
	return fun.contains.call(create_groups[section], username);
}
function read_group_contains(section, username) {
	return fun.contains.call(read_groups[section], username);
}
function modify_group_contains(section, username) {
	return fun.contains.call(modify_groups[section], username);
}

//Generate and return only html form fields of a certain subset, for multi-part (for layout purposes only) but single-page forms
function get_filtered_form_fields_html(section, mode, username, show_collapsed_only_enable) {
    var ret="";
    for (var i = 0, len = section_form_fields[section].length; i < len; i++) {
        var friendly_name = section_form_fields[section][i];
        var field_name = section_form_fields[section][i];
        
        if (!(section in section_form_collapsed_fields)) console.log("Warning: missing optional section_form_collapsed_fields for section: "+section)
        
        if ( !(section in section_form_collapsed_fields) && show_collapsed_only_enable)
            return ret; //only show fields once if no collapsed fields are specified (return blank here since called twice once true once false)
        if ( !(section in section_form_collapsed_fields)
            || (!show_collapsed_only_enable && !contains.call(section_form_collapsed_fields[section], field_name ))
            || (show_collapsed_only_enable && contains.call(section_form_collapsed_fields[section], field_name )) ) {
            
            if (friendly_name in section_form_friendly_names[section]) friendly_name = section_form_friendly_names[section][friendly_name];
            var prefill_value = "";
            if ((username in prefill_data_by_user) && (field_name in prefill_data_by_user[username])) prefill_value = prefill_data_by_user[username][field_name];
            if (field_name in choices_by_field) {
                ret += "\n" + '<div class="form-group">';
                if (show_collapsed_only_enable) ret += "\n" + '  <label class="control-label col-sm-2" style="color:darkgray">'+friendly_name+':</label>';
                else ret += "\n" + '  <label class="control-label col-sm-2" >'+friendly_name+':</label>';
                ret += "\n" + '  <div class="col-sm-10">';
                ret += "\n" + '    <div class="btn-group" data-toggle="buttons">';
                for (var choice_i = 0, choice_len = choices_by_field[field_name].length; choice_i < choice_len; choice_i++) {
                    var friendly_name = choices_by_field[field_name][i];
                    ret += "\n" + '      <label class="btn btn-primary"><input type="radio" name="'+field_name+'" value="'+choices_by_field[field_name][i]+'"/>'+friendly_name+'</label>';
                }
                ret += "\n" + '    </div>';
                ret += "\n" + '  </div>';
                ret += "\n" + '</div>';
            }
            else {
                ret += "\n" + '  <div class="form-group">';
                if (show_collapsed_only_enable) ret += "\n" + '  <label class="control-label col-sm-2" style="color:darkgray">'+friendly_name+':</label>';
                else ret += "\n" + '  <label class="control-label col-sm-2" >'+friendly_name+':</label>';
                ret += "\n" + '    <div class="col-sm-10">';
                ret += "\n" + '      <input class="form-control" type="text" name="'+field_name+'" value="'+prefill_value+'"/>';
                ret += "\n" + '    </div>';
                ret += "\n" + '  </div>';
            }
        }
    }    
    return ret;
}

// Configure express to use handlebars templates
var startTime = moment('08:10', "HH:mm").format("HH:mm");
var endTime = moment('15:30', "HH:mm").format("HH:mm");
var hbs = exphbs.create({
	 helpers: {
         remove_audio_message: function() {
             delete session.runme;
         },
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
		if_is_any_form_mode: function(mode, opts) {
			//console.log("* checking if_eq while user is " + a);
            var is_match = false;
            var arr = ["create", "modify"];
            //if (Array.isArray(arr)) {
            for (i=0, len=arr.length; i<len; i++) {
                if (mode==arr[i]) {
                    is_match = true;
                    break;
                }
            }
            //}
			if (is_match) // Or === 
			    return opts.fn(this);
			else
				return opts.inverse(this);
		},
		if_formula: function(a, opts) {
			if (a.startsWith("="))
			    return opts.fn(this);
			else
				return opts.inverse(this);
		},
		get_member: function(a, name, opts) {
			return (name in a) ? a.name : "";
		},
        get_section_form: function(section, mode, username, opts) {
            //globals of note:
            //section_required_fields["care"] = ["first_name", "last_name", "chaperone", "grade_level"];
            //section_form_fields["care"] = ["first_name", "last_name", "chaperone", "grade_level", "family_id", "stated_time", "stated_date"];
            //choices_by_field["heading"] = ["in", "out"]
            //section_form_collapsed_fields["care"] = ["family_id", "stated_time", "stated_date"];
            //section_form_friendly_names["care"]["first_name"] = "Student First Name";
            //prefill_data_by_user
            var ret = "No form implemented ("+section+")";
            if (section in section_form_fields) {
                ret = "\n"+'<form class="form-horizontal" id="student-microevent" action="' + config.proxy_prefix_then_slash + 'student-microevent" method="post">';
                
                ret += "\n" + '  <input type="hidden" name="section" value="'+section+'"/>';
                if (!(username in prefill_data_by_user) || !("mode" in prefill_data_by_user[username])) {
                    ret += "\n" + '  <input type="hidden" name="mode" id="mode" value="create"/>';
                }
                else {
                    ret += "\n" + '  <input type="hidden" name="mode" id="mode" value="'+prefill_data_by_user[username]["mode"]+'"/>';
                }
                
                //for (index in section_form_fields[section]) {
                ret += get_filtered_form_fields_html(section, mode, username, false);
                ret += '  <div class="form-group">';
                ret += '    <div class="col-sm-10" style="text-align:center">';
                var friendly_action_name = "Enter";
                if (mode && (mode in friendly_mode_action_text)) friendly_action_name=friendly_mode_action_text[mode];
                ret += '      <input type="submit" class="btn btn-primary btn-sm" value="'+friendly_action_name+'"/>';
                var more_fields_html = get_filtered_form_fields_html(section, mode, username, true);
                if (more_fields_html.length>0) ret += '      <a data-toggle="collapse" href="#extra-fields" class="btn btn-default btn-md" role="button">More Options</a>'
                ret += '    </div>';
                ret += '  </div>';
                if (more_fields_html.length>0) {
                    ret += '  <div name="extra-fields" class="collapse" id="extra-fields">';
                    ret += more_fields_html;
                    ret += '  </div>';
                }
                ret += "\n  </form>"
            }
            return new Handlebars.SafeString(ret); // mark as already escaped (so that literal html can be pushed) -- normally new Handlebars.SafeString
;
        },
		eachProperty: function(context, options) {
			//see Ben on https://stackoverflow.com/questions/9058774/handlebars-mustache-is-there-a-built-in-way-to-loop-through-the-properties-of
			var ret = "";
			for(var prop in context)
			{
				ret = ret + options.fn({property:prop,value:context[prop]});
			}
			return ret;
		},
		user_has_pinless_time: function(section, username, opts) {
			if (user_has_pinless_time(section, username)) // Or === 
			    return opts.fn(this);
			else
				return opts.inverse(this);
		},
		if_undefined: function(a, opts) {
			//NOTE: Never use this, since sending undefined variables to render causes failure to render!
			//      Ensure variable exists, and then use is_blank instead.
			//console.log("* checking if_eq while user is " + a);
			if (a === undefined) // Or === 
			    return opts.fn(this);
			else
				return opts.inverse(this);
		},
		if_blank: function(a, opts) {
			//console.log("* checking if_eq while user is " + a);
			if (fun.is_blank(a))
			    return opts.fn(this);
			else
				return opts.inverse(this);
		},
		createGroupContains: function(haystack, needle, opts) {
			if (fun.contains.call(create_groups[haystack], needle))
				return opts.fn(this);
			else
				return opts.inverse(this);
		},
		readGroupContains: function(haystack, needle, opts) {
			if (fun.contains.call(read_groups[haystack], needle))
				return opts.fn(this);
			else
				return opts.inverse(this);
		},
		modifyGroupContains: function(haystack, needle, opts) {
			if (fun.contains.call(modify_groups[haystack], needle))
				return opts.fn(this);
			else
				return opts.inverse(this);
		},
		friendlyModeName: function(needle, opts) {
			if (needle in friendly_mode_names)
				return friendly_mode_names[needle];
			else
				return needle;
		},
		friendlySectionName: function(needle, opts) {
			if (needle in friendly_section_names)
				return friendly_section_names[needle];
			else
				return needle;
		},
		//isReadableByUser: function(section, user, opts) {
		//	if (fun.contains.call(, ))
		//		return opts.fn(this);
		//	else
		//		return opts.inverse(this);
		//},
		isOnlyEmployeeReadSection: function(needle, opts) {
			if (fun.contains.call(only_employee_read_sections, needle))
				return opts.fn(this);
			else
				return opts.inverse(this);
		},
		isOnlyEmployeeModifySection: function(needle, opts) {
			if (fun.contains.call(only_employee_modify_sections, needle))
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
		get_proxy_prefix_then_slash: function(opts) {
			if (config.proxy_prefix_then_slash.trim())
				return config.proxy_prefix_then_slash.trim();
			else
				return "/";
		},
        get_tz_offset_mins: function(opts) {
            return moment().utcOffset();
        },
        get_startup_js_code: function(opts) {
            return session.runme;
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
/*
//use app.use(express.static(__dirname + '/public')); // instead of below (see above)
app.get('/public/sounds/missing-information.wav', function(req, res){
    //see also https://stackoverflow.com/questions/5823722/how-to-serve-an-image-using-nodejs
    var request = url.parse(req.url, true);
    var action = request.pathname;
    console.log("action: "+action);
    //if (action == '/logo.gif') {
        //var img = fs.readFileSync('./logo.gif');
        //res.writeHead(200, {'Content-Type': 'image/gif' });
        //res.end(img, 'binary');
    //} else {
    var wav = fs.readFileSync('./public/sounds/missing-information.wav');
    res.writeHead(200, {'Content-Type': 'audio/wav'});
    res.end(wav, 'binary');
    //}
    //} else { 
    //    res.writeHead(200, {'Content-Type': 'text/plain' });
    //    res.end('Hello World \n');
    //}
});
app.get('/public/sounds/security-warning.wav', function(req, res){
    var request = url.parse(req.url, true);
    var action = request.pathname;
    console.log("action: "+action);
    var wav = fs.readFileSync('./public/sounds/security-warning.wav');
    res.writeHead(200, {'Content-Type': 'audio/wav'});
    res.end(wav, 'binary');
});
app.get('/public/sounds/success.wav', function(req, res){
    var request = url.parse(req.url, true);
    var action = request.pathname;
    console.log("action: "+action);
    var wav = fs.readFileSync('./public/sounds/success.wav');
    res.writeHead(200, {'Content-Type': 'audio/wav'});
    res.end(wav, 'binary');
});
*/

//displays our homepage
app.get('/', function(req, res){
	console.log("");
	var user_sections = [];
	var user_modes_by_section = {};
	var years = [];
	var months = [];
	var days = [];
    var item_keys = []; // the associative array keys for accessing objects in the day
    var items = []; //the entries
	var section = null; //selected section
	var mode = null; //selected mode
	var selected_month = null;
	var selected_year = null;
	var selected_day = null;
	var selected_item_key = null;
	var user_selectable_modes = [];  //similar to entry in user_modes_by_section that corresponds to section, except excludes transient modes
	var this_sheet_field_names = [];
	var this_sheet_field_friendly_names = [];
	if (req.user && req.user.username) {
		
		var preload_table_names = sections; //["care","commute"];
		for (var index in preload_table_names) {
			if (preload_table_names.hasOwnProperty(index)) {
				var val = preload_table_names[index];
				if ( create_group_contains(val, req.user.username) || read_group_contains(val, req.user.username) || modify_group_contains(val, req.user.username) ) {
					user_sections.push(val);
					if (!(val in user_modes_by_section)) user_modes_by_section[val] = [];
					if (create_group_contains(val, req.user.username)) {
						user_modes_by_section[val].push("create");
					}
					if (read_group_contains(val, req.user.username)) {
						user_modes_by_section[val].push("read");
					}
					if (modify_group_contains(val, req.user.username)) {
						user_modes_by_section[val].push("modify");
					}
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
	if (fun.is_not_blank(req.query.section)) {
		section = req.query.section;
		req.session.section = section;
	}
	else if (fun.is_not_blank(req.session.section)) {
		section = req.session.section;
	}
	else if (user_sections && (user_sections.length>=1)) {
		section = user_sections[0];
		req.session.section = section;
	}
	
	if (section) {
		if (section in section_sheet_fields) {
			for (var indexer in section_sheet_fields[section]) {
				var val = section_sheet_fields[section][indexer];
				this_sheet_field_names.push(val);
				if (val in section_sheet_fields_friendly_names[section]) val = section_sheet_fields_friendly_names[section][val];
				this_sheet_field_friendly_names.push(val);
			}
		}
		if (section in user_modes_by_section) {
			for (var indexer in user_modes_by_section[section]) { //for (group in user_modes_by_section["section"]) {
				if (!contains.call(transient_modes, user_modes_by_section[section][indexer])) {
					user_selectable_modes.push(user_modes_by_section[section][indexer]);
				}
			}
		}
	}
	
	if (fun.is_not_blank(req.query.mode)) {
		mode = req.query.mode;
		req.session.mode = mode;
	}
	else if (fun.is_not_blank(req.session.mode)) {
		mode = req.session.mode;
	}
	else if (user_selectable_modes && (user_selectable_modes.length>=1)) {
		if (req.user && req.user.username && (req.user.username in default_mode_by_user)) mode=default_mode_by_user[req.user.username];
		else mode = user_selectable_modes[user_selectable_modes.length-1];
		req.session.mode = mode;
	}
	
	var prefill_mode = "";
	if (fun.is_not_blank(req.query.prefill_mode)) {
		prefill_mode = req.query.prefill_mode;
		req.session.prefill_mode = prefill_mode;
	}
	if (fun.is_not_blank(req.body.prefill_mode)) {
		prefill_mode = req.body.prefill_mode;
		req.session.prefill_mode = prefill_mode;
	}
	else if (fun.is_not_blank(req.session.prefill_mode)) {
		prefill_mode = req.session.prefill_mode;
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
			if (read_group_contains(section, req.user.username)) {
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
                else if (!selected_year && years.length>0) {
					selected_year = years[years.length-1];
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
							//console.log("(got cached months: "+fun.to_ecmascript_value(months));
						}
                        if (months.length==1) {
                            selected_month = months[0];
                            req.session.selected_month = selected_month;
                            //console.log("Auto selected_month "+selected_month);
                        }
						else if (!selected_month && months.length>0) {
							selected_month = months[months.length-1];
							req.session.selected_month = selected_month;
							if (!selected_month) console.log("ERROR: blanked out on month (cache fail)");
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
							else if (!selected_day && days.length>0) {
								selected_day = days[days.length-1];
								req.session.selected_day = selected_day;
								if (!selected_day) console.log("ERROR: blanked out on day (cache fail)");
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
                                //console.log("## ITEM KEYS: "+fun.to_ecmascript_value(item_keys));
                                //console.log("(ITEM KEYS.length:"+item_keys.length+")");
								//console.log("## ITEMS:"+items);
                                //for (var item_key_i = 0; item_key_i < item_keys.length; item_key_i++) {
								var msg = "";
								for (var item_key_i in item_keys) {
                                    var item_key = item_keys[item_key_i];
									var item_path = d_path + "/" + item_key;
									//console.log("  - "+item_key);
                                    dat[section][selected_year][selected_month][selected_day][item_key] = {};
									if (fs.statSync(item_path).isFile()) {
                                        try {
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
                                        catch (err) {
                                            req.session.error = "\nCould not finish reading "+item_path+": "+err;
                                        }
									}
									else {
										msg += " ...missing file "+item_path+" ";
									}
                                }
                                if (msg.length>0) res.session.error=msg;
                                //TODO: find out why this doesn't work: items = dat[section][selected_year][selected_month][selected_day];
                                //for (var key_i = 0; key_i < items.length; key_i++) {
                                //    console.log("    * "+items[key_i]asdf (iterate object members)
                                //}
                            }//end if selected_day
						}//end if selected_month
					}
				}
			}
			else {
				//NOTE: Actually displaying the data cached above is managed separately, so do not show security errors below.
				
				//var error_string = " has no permission to read existing " + section;
				//if (req.user && req.user.username) error_string = req.user.username + error_string;
				//else error_string = "Unauthenticated user" + error_string;
				//req.session.error = error_string;
			}
		}
		
	}
	res.render('home', {user: req.user, section: section, mode: mode, prefill_mode: prefill_mode, selected_year:selected_year, selected_month: selected_month, selected_day: selected_day, selected_item_key: selected_item_key, sections: user_sections, modes_by_section: user_modes_by_section, user_selectable_modes: user_selectable_modes, years: years, months: months, days: days, objects: items, this_sheet_field_names: this_sheet_field_names, this_sheet_field_friendly_names: this_sheet_field_friendly_names});
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


app.post('/student-microevent', function(req, res){
	//req is request, res is response
    if (("user" in req) && ("username" in req.user) ) {
        console.log("* NOTE: student-microevent by " + req.user.username);
        //if using qs, student sign in/out form subscript fields can be created in html template, then accessed here via dot notation: family_id first_name last_name grade (time is calculated here)
		//var prefill_stated_time;
        if (fun.is_not_blank(req.body.stated_time)) req.session.prefill_stated_time = req.body.stated_time.trim();
        else {
            delete req.session.prefill_stated_time;
        }
        //else req.session.prefill_stated_time = moment().format("HH:mm:ss");
        
        if (fun.is_not_blank(req.body.stated_date)) req.session.prefill_stated_date = req.body.stated_date.trim();
        else {
            delete req.session.prefill_stated_date;
        }
        //else req.session.prefill_stated_date = moment().format("YYYY-MM-DD");
        
        //if (("family_id" in req.body) ) req.session.prefill_family_id = req.body.family_id.trim();
        //if ("first_name" in req.body) req.session.prefill_first_name = req.body.first_name.trim();
        //if ("last_name" in req.body) req.session.prefill_last_name = req.body.last_name.trim();
        //if ("grade_level" in req.body) req.session.prefill_grade_level = req.body.grade_level.trim();
        //if ("chaperone" in req.body) req.session.prefill_chaperone = req.body.chaperone.trim();
        //if ("reason" in req.body) req.session.prefill_reason = req.body.reason.trim();
        var record = {};
        var custom_error = null;
        var missing_fields = "";
		
		req.session.section = req.body.section;
		req.session.mode = req.body.mode;
		 
        if (req.body.section in section_form_fields) {
            for (var index in section_form_fields[req.body.section]) {
                if (section_form_fields[req.body.section].hasOwnProperty(index)) {
                    var key = section_form_fields[req.body.section][index];
                    if (key in req.body) {
                        if (req.body[key]) {
							if (req.body[key].substring(0,8)!="prefill_") {
								req.session["prefill_"+key] = req.body[key];
								if (!never_save_fields.includes(key)) record[key] = req.body[key];
							}
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
            custom_error = "unknown section '" + req.body.section + "'";
        }
        if (req.body.section in section_required_fields) {
            for (var index in section_required_fields[req.body.section]) {
                if (section_required_fields[req.body.section].hasOwnProperty(index)) {
                    var key = section_required_fields[req.body.section][index];
                    if (("prefill_"+key) in req.session) {
                        if (fun.is_blank(req.session["prefill_"+key])) delete req.session["prefill_"+key];
                    }
                    if (!(("prefill_"+key) in req.session)) {
                        custom_error = "MISSING: ";
                        if (missing_fields!="") missing_fields += ",";
                        key_friendly_name = key;
                        if (fields_friendly_names.key) key_friendly_name = fields_friendly_names.key;
                        missing_fields += " " + key;
                    }
                    else {
                        console.log("prefill_"+key + " is in session with value "+req.session["prefill_"+key]);
                    }
                }
            }
        }
        else {
            console.log("WARNING: no required fields are specified for section '" + req.body.section + "'.");
            custom_error = "unknown section '" + req.body.section + "'";
        }
        
        //console.log(req.body.family_id);
        if (!custom_error) {
			
			//already done above?
			//for (var indexer in req.session) {
			//	if (req.session.hasOwnProperty(indexer)) {
			//		if (indexer.startsWith("prefill_")) {
			//			record[indexer.substring(8)] = req.session.indexer;
			//		}
			//	}
			//}
			
			//if already done above, why was this code here before the loop was (NOTE: commented code updated for non-global prefill data as writing this comment)?
            //if ("prefill_name" in req.session) record.name=req.session.prefill_name;
            //if ("prefill_first_name" in req.session) record.first_name=req.session.prefill_first_name;
            //if ("prefill_last_name" in req.session) record.last_name=req.session.prefill_last_name;
            //if ("prefill_chaperone" in req.session) record.chaperone=req.session.prefill_chaperone;
            //record.grade_level=req.session.prefill_grade_level;
            //if ("prefill_family_id" in req.session) record.family_id=req.session.prefill_family_id;
			var stated_date_enable = false;
            if ("prefill_stated_date" in req.session) {
				
				if (req.session.prefill_stated_date.length==10) {
					if (req.session.prefill_stated_date.substring(2,3)=="/"
						&& req.session.prefill_stated_date.substring(5,6)=="/"
						&& fun.only_contains_any_char(req.session.prefill_stated_date.substring(0,2), "0123456789")
						&& fun.only_contains_any_char(req.session.prefill_stated_date.substring(3,5), "0123456789")
						&& fun.only_contains_any_char(req.session.prefill_stated_date.substring(6), "0123456789")
						) {
						//convert MM/DD/YYYY to YYYY-MM-DD:
						original_stated_date = req.session.prefill_stated_date;
						req.session.prefill_stated_date = req.session.prefill_stated_date.substring(6) + "-" + req.session.prefill_stated_date.substring(0,2) + "-" + req.session.prefill_stated_date.substring(3,5);
						stated_date_enable = true;
						console.log("  * NOTE: converted date " + original_stated_date + " to " + req.session.prefill_stated_date)
					}
					else if (req.session.prefill_stated_date.substring(4,5)=="-"
						&& req.session.prefill_stated_date.substring(7,8)=="-"
						&& fun.only_contains_any_char(req.session.prefill_stated_date.substring(0,4), "0123456789")
						&& fun.only_contains_any_char(req.session.prefill_stated_date.substring(5,7), "0123456789")
						&& fun.only_contains_any_char(req.session.prefill_stated_date.substring(8), "0123456789")
						) {
						stated_date_enable = true;
					}
				}
				if (!stated_date_enable) {
					custom_error = "custom date " + req.session.prefill_stated_date + " must be in YYYY-MM-DD or MM/DD/YYYY format";
					//var details = " ... ";
					//if (!fun.only_contains_any_char(req.session.prefill_stated_date.substring(6), "0123456789")) details += "non-number in last 4 digits; ";
					//if (!fun.only_contains_any_char(req.session.prefill_stated_date.substring(0,4), "0123456789")) details += "non-number in first 4 digits; ";
					//custom_error += details;
				}
				else {
					if (user_has_pinless_time(req.body.section, req.user.username)) {
						console.log("  * NOTE: PIN skipped for commute custom date: "+req.user.username+" (this is ok since user has pinless custom time for this section)");
					}
					else if (modify_group_contains(req.body.section, req.user.username)) {
						console.log("  * NOTE: PIN skipped for commute custom date: "+req.user.username+" (this is ok since user has modify priv for this section)");
					}
					else if (req.body.pin && config.office_pin && (req.body.pin==config.office_pin)) {
					}
					else {
						custom_error="INCORRECT PIN: To use custom time, office must enter the correct pin (otherwise leave time blank for current).";
						if (!config.office_pin) custom_error = custom_error + "; website administrator has not yet set office_pin in config.json";
						stated_date_enable = false;
					}
					if (stated_date_enable) record.stated_date=req.session.prefill_stated_date;
				}
			}
            //var uac_error = null;
            if (req.session.prefill_stated_time !== undefined) {
                if (req.session.prefill_stated_time.toLowerCase().match("am")
                    || req.session.prefill_stated_time.toLowerCase().match("pm") ) {
                    if (  (req.body.section=="commute") &&  ( (!req.body.pin) || (req.body.pin!=config.office_pin))  ) {
						if (fun.contains.call(modify_groups["commute"], req.user.username)) {
							console.log("  * NOTE: PIN skipped for commute custom time: "+req.user.username+" (this is ok since user has modify priv for this section)");
						}
						else {
							custom_error="INCORRECT PIN: To use custom time, office must enter the correct pin (otherwise leave time blank for current).";
							if (!config.office_pin) custom_error = custom_error + "; website administrator has not yet set office_pin in config.json";
							custom_error = custom_error + ".";
						}
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
				//NOTE: if key is specified, then check modify_groups instead, and edit same file instead.
                if (fun.contains.call(create_groups[req.body.section],req.user.username)) {
                    signs_dir_name = req.body.section;
                    var signs_dir_path = data_dir_path + "/" + signs_dir_name;
                    if (!fs.existsSync(signs_dir_path))
                        fs.mkdirSync(signs_dir_path);
                    var y_dir_name = moment().format("YYYY");
					if (stated_date_enable) y_dir_name = req.session.prefill_stated_date.substring(0,4);
                    var y_dir_path = signs_dir_path + "/" + y_dir_name;
                    if (!fs.existsSync(y_dir_path))
                        fs.mkdirSync(y_dir_path);
                    var m_dir_name = moment().format("MM");
					if (stated_date_enable) m_dir_name = req.session.prefill_stated_date.substring(5,7);
                    var m_dir_path = y_dir_path + "/" + m_dir_name;
                    if (!fs.existsSync(m_dir_path))
                        fs.mkdirSync(m_dir_path);
                    var d_dir_name = moment().format("DD");
					if (stated_date_enable) d_dir_name = req.session.prefill_stated_date.substring(8,10);
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
					if (config.audio_enable) session.runme = new Handlebars.SafeString("var audio = new Audio('sounds/success.wav'); audio.play();");
					for (var indexer in req.session) {
						if (req.session.hasOwnProperty(indexer)) {
							if (indexer.startsWith("prefill_")) delete req.session.indexer;
						}
					}
                    //delete req.session.prefill_time;
                    //delete req.session.prefill_family_id;
                    //delete req.session.prefill_first_name;
                    //delete req.session.prefill_last_name;
                    //delete req.session.prefill_grade_level;
                    //delete req.session.prefill_chaperone;
                    //delete req.session.prefill_reason;
                    //delete req.session.prefill_time;
                    //delete req.session.prefill_ctime;
                    //delete req.session.prefill_stated_time;
                    //delete req.session.prefill_stated_date;
                    delete session.runme;
                }
                else {
                    req.session.error = "not authorized to modify data for '" + req.body.section + "'";
                    if (config.audio_enable) session.runme = new Handlebars.SafeString("var audio = new Audio('sounds/security-warning.wav'); audio.play();");
                    delete req.session.prefill_pin;
                    delete req.session.prefill_heading;
                }
            }
            else {//formatting error
                
                req.session.error = custom_error;//+ "<script>var Speech = require('speak-tts'); Speech.init({'onVoicesLoaded': (data) => {console.log('voices', data.voices)},'lang': 'en-US','volume': 0.5,'rate': 0.8,'pitch': 0.8});"+'Speech.speak({text: "'+custom_error+'" })</script>';
                if (config.audio_enable) session.runme = new Handlebars.SafeString("var audio = new Audio('sounds/missing-information.wav'); audio.play();");
                delete req.session.prefill_pin;
                delete req.session.prefill_heading;
            }
        }
        else {
            for (var index in req.body) {
                if ( contains.call(section_form_fields[req.body.section], index) ) {
                    req.session["prefill_"+index] = req.body[index];
                }
            }
            delete req.session.prefill_pin;
            delete req.session.prefill_heading;
            //req.session.error = new Handlebars.SafeString(custom_error + missing_fields + "<script>var audio = new Audio('missing-information.wav'); audio.play();</script>");
            req.session.error = custom_error + missing_fields;
            if (config.audio_enable) session.runme = new Handlebars.SafeString("var audio = new Audio('sounds/missing-information.wav'); audio.play();");
        }
    }
    else {
        for (var member in req.session) {
			if (member.substring(0,8)=="prefill_") delete req.session.member;
		}
        req.session.error = "The server was reset so you must log in again. Sorry for the inconvenience.";
        delete session.runme;
    }
	if (contains.call(transient_modes, req.session.mode)) req.session.mode = transient_modes_return[req.session.mode];
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
  if (req.user) {
	var name = req.user.username;
	console.log("LOGGING OUT " + req.user.username)
  }
  else {
	console.log("* LOGGING OUT but no user is loaded (that's ok--server was probably reset since last page refresh, then user clicked logout)")
  }
  //req.logout();
  //res.redirect(config.proxy_prefix_then_slash);
  //req.logout() doesn't clear session variables, so do manual logout instead (see below), using jlmakes implementation of Brice's suggestion from https://stackoverflow.com/questions/13758207/why-is-passportjs-in-node-not-removing-session-on-logout
  delete req.session.selected_day;
  delete req.session.selected_month;
  delete req.session.selected_year;
  delete session.runme;
  req.session.destroy(function (err) {
    res.redirect(config.proxy_prefix_then_slash.trim()); //Inside a callback… bulletproof!
  });
  req.session.notice = "You have successfully been logged out " + name + "!";
});

//===============PORT=================
var port = process.env.PORT || 8080; //select your port or let it pull from your .env file
app.listen(port);
console.log("listening on " + port + "!");
