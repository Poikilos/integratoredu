//index.js/
var express = require('express'),
	exphbs = require('express-handlebars'),
	logger = require('morgan'),
	moment = require('moment-timezone'),
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
//var dynamic_a_name = "dynamic_bookmark";

var autofill_cache_format = "yml"; //yml or json

////// POLYFILLS //////

//see also https://stackoverflow.com/questions/1144783/how-to-replace-all-occurrences-of-a-string-in-javascript
//String.prototype.replaceAll = function(search, replace) {
//    if (replace === undefined) {
//        return this.toString();
//    }
//    return this.split(search).join(replace);
//}
String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.split(search).join(replacement);
};
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

var dat; //this is the cache
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
var config = require('./data/config.js'), //config file contains all tokens and other private info
	fun = require('./functions.js'); //functions file contains our non-app-specific functions including those for our Passport and database work

var app = express();
app.use(express.static(__dirname + '/public'));
//app.enable('trust proxy');
app.set('trust proxy', 'loopback, linklocal, uniquelocal'); //NOTE: Allows req.ips, which derives from X-Forwarded-* and therefore is easily spoofed
//app.listen(8080);

if (!config.proxy_prefix_then_slash) config.proxy_prefix_then_slash = "/";
if (!config.hasOwnProperty("audio_enable")) config.audio_enable = true;
//var basePath = "./";
var basePath = "."+config.proxy_prefix_then_slash;

var data_dir_name = "data";
var data_dir_path = data_dir_name;

var autofill_cache_path = data_dir_path+"/"+"autofill_cache."+autofill_cache_format;
var settings_path = data_dir_path+"/"+"settings.yml";

var sections = ["care", "commute", "admin"];
var friendly_section_names = {"care":"Extended Care","commute":"Commute","admin":"Advanced"};

//var section_rates = {}; //how much client pays by the hour for section for time spent outside of startTime and endTime
//section_rates["care"] = 7.50;


var modes = ["create", "read", "modify", "settings", "reports"];
var transient_modes = ["modify"]; //modes only used during operation of other modes
var transient_modes_return = {};
transient_modes_return["modify"] = "read";
transient_modes_return["change-section-settings"] = "settings";
transient_modes_return["poke-settings"] = "settings";

var friendly_mode_names = {};
friendly_mode_names["create"] = "Entry Form";
friendly_mode_names["read"] = "History";
friendly_mode_names["modify"] = "Edit";
friendly_mode_names["reports"] = "Reports";

var friendly_mode_action_text = {};
friendly_mode_action_text["create"] = "Enter";
friendly_mode_action_text["read"] = "Save"; //save button since read will show editable fields if user has write priv to the section
friendly_mode_action_text["modify"] = "Save";
friendly_mode_action_text["reports"] = "Save";

var section_required_fields = {};
section_required_fields["care"] = ["first_name", "last_name", "chaperone", "grade_level"];
section_required_fields["commute"] = ["name", "grade_level", "heading", "reason"];

var section_form_fields = {};
section_form_fields["care"] = ["first_name", "last_name", "chaperone", "grade_level", "family_id", "stated_time", "stated_date"];
section_form_fields["commute"] = ["name", "grade_level", "heading", "reason", "stated_time", "stated_date", "pin"];

var field_lookup_values = {};
field_lookup_values["heading"] = ["in", "out"]

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
section_sheet_fields["care"] = ["family_id", "=caretime()", "=caretime_h()", "qty", "=careprice()", "=get_date_from_path()", "time", "stated_time", "first_name", "last_name", "grade_level", "chaperone", "modified_by"]
section_sheet_fields["commute"] = ["=get_date_from_path()", "time", "name", "grade_level"]

var section_sheet_fields_friendly_names = {}
section_sheet_fields_friendly_names["care"] = {}
section_sheet_fields_friendly_names["care"]["=get_date_from_path()"] = "Stored";
section_sheet_fields_friendly_names["care"]["=careprice()"] = "Accrued";
section_sheet_fields_friendly_names["care"]["first_name"] = "First";
section_sheet_fields_friendly_names["care"]["last_name"] = "Last";
section_sheet_fields_friendly_names["care"]["grade_level"] = "Grade Level";
section_sheet_fields_friendly_names["care"]["family_id"] = "FamilyID";
section_sheet_fields_friendly_names["care"]["time"] = "Time";
section_sheet_fields_friendly_names["care"]["qty"] = "Count";
section_sheet_fields_friendly_names["commute"] = {}
section_sheet_fields_friendly_names["commute"]["=get_date_from_path()"] = "Date";
section_sheet_fields_friendly_names["commute"]["grade_level"] = "Grade Level";
//section_sheet_fields_friendly_names["commute"]["time"] = "Time";


//var section_sheet_fields_names = {};
//section_sheet_fields_names["care"] = {};
//section_sheet_fields_names["care"]["time"] = "Time";
//section_sheet_fields_names["care"]["=get_date_from_path()"] = "Date";

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




//var default_groupby = {};
//default_groupby["care"] = "family_id";

//var id_user_within_microevent = {};
//id_user_within_microevent["care"] = ["first_name", "last_name", "grade_level"];



//var autofill_requires = {};
//autofill_requires["care"] = {};
//autofill_requires["care"]["family_id"] = ["first_name", "last_name", "grade_level"];
//autofill_requires["care"]["qty"] = ["first_name"];

var autofill_cache = null;

var default_autofill_cache = {};
default_autofill_cache["care"] = {};
default_autofill_cache["care"]["family_id"] = {};
default_autofill_cache["care"]["family_id"]["jake+gustafson+13"] = "-1";
default_autofill_cache["care"]["family_id"]["jake+gustafson+0"] = "-1";
default_autofill_cache["care"]["qty"] = {};
default_autofill_cache["care"]["qty"]["j&s+gustafson+0"] = "2";

var default_total = {};
default_total["care"] = "=careprice()";

//var section_report_edit_field = {}; //runtime var, do not save (starts as value of _settings.section.mode.selected_field_default)

var _settings = null;

var _settings_default = {};
_settings_default["local_time_zone"] = "America/New_York";
_settings_default["care"] = {};
_settings_default["care"]["default_groupby"] = {};
_settings_default["care"]["default_groupby"] = "family_id";
_settings_default["care"]["extended_hours_hourly_price"] = 7.50
_settings_default["care"]["local_start_time"] = '08:10:00';
_settings_default["care"]["local_end_time"] = '15:05:00';
_settings_default["care"]["reports"] = {};
_settings_default["care"]["reports"]["selected_field_default"] = "family_id";
_settings_default["care"]["list_implies_qty"] = "first_name";
_settings_default["care"]["list_implies_multiple_entries"] = "last_name";
_settings_default["care"]["list_implies_multiple_entries_paired_with"] = "first_name";
_settings_default["care"]["autofill_requires"] = {}
_settings_default["care"]["autofill_requires"]["family_id"] = ["first_name", "last_name", "grade_level"];
_settings_default["care"]["autofill_requires"]["qty"] = ["first_name"];
//NOTE: mid uses counting numbers, and last param is inclusive
_settings_default["care"]["history_sheet_fields"] = ["time", "qty", "=mid(first_name,1,1)", "=mid(last_name,1,1)", "grade_level", "chaperone", "family_id"];
_settings_default["commute"] = {};
_settings_default["commute"]["local_start_time"] = '08:10:00';
_settings_default["commute"]["local_end_time"] = '15:05:00';
_settings_default["commute"]["history_sheet_fields"] = ["time", "name", "grade_level"];  // "=get_date_from_path()", 
_settings_default["care"]["mode_priority"] = ["reports","create", "read"];
_settings_default["commute"]["mode_priority"] = ["reports","create", "read"];
//var startTimeString = startTime.format("HH:mm:ss");
//var endTimeString = endTime.format("HH:mm:ss");
//var startTime = moment('08:10:00', "HH:mm:ss");
//var endTime = moment('15:05:00', "HH:mm:ss");

var default_mode_by_user = {};
default_mode_by_user["care"] = "create";
default_mode_by_user["commute"] = "create";
default_mode_by_user["attendance"] = "read";
default_mode_by_user["accounting"] = "reports";



var _groups = {};
_groups["admin"] = ["admin"];
_groups["care"] = ["admin", "accounting", "care"];
_groups["accounting"] = ["admin", "accounting"];
_groups["commute"] = ["admin", "attendance", "commute"];
_groups["attendance"] = ["admin", "attendance"];
var _permissions = {}; // permission.<group>.<section> equals array of permissions
_permissions["admin"] = {};
_permissions["admin"]["admin"] = ["create", "read", "modify", "reports", "settings", "poke-settings"];
_permissions["admin"]["care"] = ["create", "read", "modify", "reports", "customtime", "settings", "change-section-settings"];
_permissions["admin"]["commute"] = ["create", "read", "modify", "reports"];
_permissions["care"] = {};
_permissions["care"]["care"] = ["create", "read", "customtime"];
_permissions["accounting"] = {};
_permissions["accounting"]["care"] = ["create", "read", "modify", "reports", "customtime", "change-section-settings"]
_permissions["commute"] = {};
_permissions["commute"]["commute"] = ["create"];
_permissions["attendance"] = {};
_permissions["attendance"]["commute"] = ["create", "read", "reports"];


function autofill(section, record, write_to_record_enable) {
	if (section) {
		if (has_setting(section+".autofill_requires")) {//if (_settings && _settings.hasOwnProperty(section) && _settings[section].hasOwnProperty("autofill_requires")) {//if (id_user_within_microevent.hasOwnProperty(section)) {
			//if (default_groupby.hasOwnProperty(section)) {
			for (var requirer in _settings[section]["autofill_requires"]) {
				var present_count = 0;
				var combined_primary_key = null;
				for (i=0; i<_settings[section]["autofill_requires"][requirer].length; i++) {
					var key = _settings[section]["autofill_requires"][requirer][i];
					var val = "";
					if (record.hasOwnProperty(key)) {
						if (combined_primary_key===null) combined_primary_key = record[key].replaceAll("+","&").toLowerCase().trim();
						else combined_primary_key += "+" + record[key].replaceAll("+","&").toLowerCase().trim();
						present_count++;
						//console.log("[ ?@ ] verbose message: "+key+" present");
					}
					//else console.log("[ ?@ ] verbose message: "+key+" not present");
				}
				if (present_count>0 && present_count==_settings[section]["autofill_requires"][requirer].length) {  //id_user_within_microevent[section].length) {
					console.log("[ ?@ ] combined_primary_key:"+combined_primary_key);
					if (!record.hasOwnProperty(requirer)) {
						if (write_to_record_enable) {
							if (autofill_cache.hasOwnProperty(section)
								&& autofill_cache[section].hasOwnProperty(requirer)
								&& autofill_cache[section][requirer].hasOwnProperty(combined_primary_key)
							) {
								record[requirer] = autofill_cache[section][requirer][combined_primary_key];
								console.log("[ =@ ] (verbose message) cache hit: since autofill_cache["+section+"]["+requirer+"]["+combined_primary_key+"] was "+record[requirer]);
							}
							else console.log("[ /@ ] (verbose message) cache miss: since autofill_cache["+section+"]["+requirer+"] does not have "+combined_primary_key);
						}
					}
					else {
						if (!autofill_cache.hasOwnProperty(section)) autofill_cache[section] = {};
						if (!autofill_cache[section].hasOwnProperty(requirer)) autofill_cache[section][requirer] = {};
						autofill_cache[section][requirer][combined_primary_key] = record[requirer];
						//json.writeFile(autofill_cache_path, autofill_cache);
						save_autofill_cache("since updated combined_primary_key "+combined_primary_key); 
					}
				}
				else console.log("[ _@ ] cache not written for "+requirer+" since count of related field(s) entered is "+present_count+" not "+_settings[section]["autofill_requires"][requirer].length);//id_user_within_microevent[section].length);
			}
		}
	}
	else console.log("[ !@ ] no section mentioned so can't autofill");
}//end autofill

function save_autofill_cache(reason) {
	if (fun.is_blank(reason)) reason = "";
	else reason=" ("+reason+")";
	if (autofill_cache_format=="yml") {
		//yaml.writeSync(autofill_cache_path, autofill_cache, "utf8");
		console.log("[ @ ] saving autofill cache"+reason+"...");
		yaml.write(autofill_cache_path, autofill_cache, "utf8", function (err) {
			if (err) {
				console.log("[ @ ] saving autofill cache"+reason+"..."+err);
			}
			//else console.log("[ @ ] saving autofill cache"+reason+"...OK");
		});
		//console.log("[ @ ] The autofill cache was saved since updated combined_primary_key "+combined_primary_key);
	}
	else {
		///console.log("[ @ ] saving autofill cache"+reason+"...");
		//async writefile:
		fs.writeFile(autofill_cache_path, JSON.stringify(autofill_cache), 'utf8', function (err) {
			if (err) {
				return console.log("[ @ ] saving autofill cache"+reason+"..."+err);
			}
			else console.log("[ @ ] saving autofill cache"+reason+"...OK");
		});
	}
}


function _get_settings_names_recursively(scope_stack) {
	var results = [];
	if (scope_stack==null) scope_stack = [];
	scope = _settings;
	var name = "";
	for (i=0, len=scope_stack.length; i<len; i++) {
		scope = scope[scope_stack[i]];
		if (name==="") name=scope_stack[i];
		else name+="."+scope_stack[i];
	}
	if (!scope) console.log("--Uh oh, "+JSON.stringify(scope_stack)+" aka "+name+" is undefined");
	else console.log("--checking "+JSON.stringify(scope_stack)+" aka "+name);
	console.log("_get_settings_names_recursively: scope at "+name);
	if ( (typeof scope === "object") && (scope !== null) ) {
		for (var key in scope) {
			//if (scope.hasOwnProperty(key)) {
				console.log("  _get_settings_names_recursively: checking in "+key);
				var scope_stack2 = [];
				scope_stack2 = scope_stack2.concat(scope_stack);
				scope_stack2.push(key);
				var results2=_get_settings_names_recursively(scope_stack2);
				if (results2) results=results.concat(results2);
			//}
		}
	}
	else if (name!=="") {
		results.push(name);
		console.log("verbose message: "+name+" is not an object");
	}
	return results;
}

function get_all_settings_names() {
	var scope_stack = [];
	var results = [];
	var results2 = _get_settings_names_recursively(null);
	if (results2) results=results.concat(results2);
	return results;
}



function _poke_object(info, scope_o, scope_stack, asserted_depth, val) {
	asserted_depth+=1; //since caller assures us, "I sent care which contains reports," or in other words, "I sent 0 which contains 1." 
	if (asserted_depth+1>=scope_stack.length) {
		if ((!scope_o.hasOwnProperty(scope_stack[scope_stack.length-1])) || (scope_o[scope_stack[scope_stack.length-1]] != val)) {
			info.changed = true;
		}
		scope_o[scope_stack[scope_stack.length-1]] = val;
	}
	else {
		if (!scope_o.hasOwnProperty(scope_stack[asserted_depth])) {
			scope_o[scope_stack[asserted_depth]] = {};
			//console.log ("[ * ] made blank "+scope_stack[asserted_depth]+" at level "+asserted_depth);
		}
		else {
			//console.log ("[ = ] changed "+scope_stack[asserted_depth]+" at level "+asserted_depth+" to "+val);
		}
		_poke_object(info, scope_o[scope_stack[asserted_depth]], scope_stack, asserted_depth, val);
	}
	//if (o && o.hasOwnProperty(section)) {
	//	for (i=0; i<scope_stack.length; i++) {
	//		var key = scope_stack[i];
	//	}
	//}
	//asserted_depth-=1;
}

function poke_setting(dot_notation, val) {
	//var scope = [];
	//dot_notation = section+"."+dot_notation;
	var scope_stack = dot_notation.split(".");
	var scope_o = null;
	if (!_settings) {
		_settings = {};
		console.log("WARNING: In poke_setting, null _settings (now set to empty object)")
	}
	if (!_settings[scope_stack[0]]) _settings[scope_stack[0]] = {};
	scope_o = _settings[scope_stack[0]];
	var asserted_depth = 0;
	var info = {};
	_poke_object(info, scope_o, scope_stack, asserted_depth, val);
	if (info.changed) {
		//yaml.writeSync(settings_path, _settings, "utf8");
		yaml.write(settings_path, _settings, "utf8", function (err) {
			if (err) {
				console.log("[ . ] Error while saving settings: " + err);
			}
			//else console.log("[ . ] saved settings");
		});
	}
}

function _peek_object(scope_o, scope_stack, asserted_depth) {
	var result = null;
	//asserted_depth+=1; //since caller assures us, "I am giving you care; care contains reports," or in other words, "I am giving you 0; 0 contains 1"
	if (asserted_depth+1>=scope_stack.length) {
		
		//if (scope_stack[scope_stack.length-1] in scope_o) {//would result in errors such as TypeError: Cannot use 'in' operator to search for 'local_time_zone' in America/New_York if scope_stack[0] is a leaf name
		if (scope_o.hasOwnProperty(scope_stack[scope_stack.length-1])) { //NOTE: hasOwnProperty doesn't work if scope_stack[0] is a leaf name, so that must be checked in shallower scope first
			result=scope_o[scope_stack[scope_stack.length-1]];
			//console.log("[ . ] got value "+result+" for key "+scope_stack[scope_stack.length-1]+" from top of stack: "+JSON.stringify(scope_stack))
		}
		else {
			//console.log("[ . ] WARNING: no "+scope_stack[scope_stack.length-1]+", "+JSON.stringify(scope_stack)+" at "+asserted_depth+" only has ");
			for (var key in scope_o) {
				if (scope_o.hasOwnProperty(key)) {
					console.log("  "+key+":"+scope_o[key]);
				}
			}
		}
	}
	else {
		//if (scope_stack[asserted_depth] in scope_o) {  // 
		if (scope_o.hasOwnProperty(scope_stack[asserted_depth])) { //NOTE: hasOwnProperty doesn't work if scope_stack[0] is a leaf name, so that must be checked in shallower scope first
			asserted_depth+=1;
			result=_peek_object(scope_o[scope_stack[asserted_depth-1]], scope_stack, asserted_depth); 
		}
		else {
			var breadcrumbs = "";
			for (i=0; i<scope_stack.length; i++) {
				breadcrumbs += scope_stack[i] + " ";
			}	
			//console.log("[ ./ ] ERROR: no "+scope_stack[asserted_depth]+" ("+breadcrumbs+"-- at "+asserted_depth+" so far of "+scope_stack.length+"), only has ");
			//for (var key in scope_o) {
			//	if (scope_o.hasOwnProperty(key)) {
			//		console.log("  "+key+":"+scope_o[key]);
			//	}
			//}
		}
	}
	//asserted_depth-=1;
	return result;
}

function peek_setting(dot_notation) {
	var result = null;
	if (dot_notation) {
		//var dot_notation = section+"."+dot_notation;
		var scope_stack = dot_notation.split(".");
		var scope_o = null;
		scope_o = _settings;//[scope_stack[0]];
		if (scope_o) {//_settings.hasOwnProperty(scope_stack[0])) {
			//TODO: resolve this workaround somehow (remove if and keep only else clause, and fix _peek_object)
			//if (scope_stack.length==1) result = _settings[scope_stack[0]];
			//else {
				//scope_o = _settings[scope_stack[0]];
				var asserted_depth = 0;
				result = _peek_object(scope_o, scope_stack, asserted_depth);
			//}
		}
		else console.log("_settings not loaded while getting "+dot_notation);
		//else console.log("[ . ] no "+scope_stack[0]+ " in _settings");
	}
	else console.log("WARNING: tried to peek with missing dot_notation");
	return result;
}

function has_setting(dot_notation) {
	//enforce required settings by loading them from _settings_default
	var result = false;
	//var dot_notation = section+"."+dot_notation;
	var scope_stack = dot_notation.split(".");
	var scope_o = null;
	if (!_settings) {
		_settings = JSON.parse(JSON.stringify(_settings_default));
		//yaml.writeSync(settings_path, _settings, "utf8");
		yaml.write(settings_path, _settings, "utf8", function (err) {
			if (err) {
				console.log("[ . ] Error while saving settings: " + err);
			}
			//else console.log("[ . ] saved settings");
		});
		console.log("[ . ]: settings not loaded so loaded defaults--this should be checked before getting to this point!");
	}
	else {
		if (peek_setting(dot_notation)===null) {
			console.log("  [ . ] checking for "+dot_notation);
			var this_scoped = _settings;
			var default_scoped = _settings_default;
			for (i=0, len=scope_stack.length; i<len; i++) {
				if (!this_scoped.hasOwnProperty(scope_stack[i])) {
					if (default_scoped.hasOwnProperty(scope_stack[i])) {
						this_scoped[scope_stack[i]] = JSON.parse(JSON.stringify(default_scoped[scope_stack[i]]));
						//yaml.writeSync(settings_path, _settings, "utf8");
						yaml.write(settings_path, _settings, "utf8", function (err) {
							if (err) {
								return console.log("[ . ] Error while saving settings from a default setting: " + err);
							}
							else console.log("[ . ]: setting was missing so default written for: "+dot_notation);
						}); 
						
						break;
					}
					else break;
				}
				this_scoped = this_scoped[scope_stack[i]];
				default_scoped = default_scoped[scope_stack[i]];
			}
		}
	}
	if (_settings) {//.hasOwnProperty(scope_stack[0])) {
		scope_o = _settings;//[scope_stack[0]];
		var asserted_depth = 0;
		result = _peek_object(scope_o, scope_stack, asserted_depth);
	}
	else console.log("ERROR: has_setting failed to load _settings");
	return result!==null;
}

function user_has_section_permission(this_username, this_section, this_permission) {
	var result = false;
	//console.log("user_has_section_permission of "+this_username+" for "+this_section+":");
	for (var group_name in _groups) {
		if (_groups.hasOwnProperty(group_name)) {
			if (fun.array_contains(_groups[group_name], this_username)) {
				if (_permissions[group_name].hasOwnProperty(this_section)) {
					if (fun.array_contains(_permissions[group_name][this_section], this_permission)) {
						result = true;
						//console.log("+has "+this_permission+" for "+group_name);
						break;
					}
					//else console.log("-doesn't have "+this_permission+" for "+group_name);
				}
				//else console.log("--no permissions for section "+this_section+" found in group "+group_name);
			}
		}
	}
	return result;
}
function user_has_pinless_time(section, username) {
	return user_has_section_permission(username, section, "customtime");
}

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

//function create_group_contains(section, username) {
//	return fun.array_contains(create_groups[section], username);
//}
//function read_group_contains(section, username) {
//	return fun.array_contains(read_groups[section], username);
//}
//function modify_group_contains(section, username) {
//	return fun.array_contains(modify_groups[section], username);
//}

//Generate and return only html form fields of a certain subset, for multi-part (for layout purposes only) but single-page forms
function get_filtered_form_fields_html(section, mode, username, show_collapsed_only_enable, prefill, missing_fields) {
	var ret="";
	for (var i = 0, len = section_form_fields[section].length; i < len; i++) {
		var friendly_name = section_form_fields[section][i];
		var field_name = section_form_fields[section][i];
		
		if (!section_form_collapsed_fields.hasOwnProperty(section)) console.log("Warning: missing optional section_form_collapsed_fields for section: "+section)
		
		if ( !(section_form_collapsed_fields.hasOwnProperty(section)) && show_collapsed_only_enable)
			return ret; //only show fields once if no collapsed fields are specified (return blank here since called twice once true once false)
		if ( (!section_form_collapsed_fields.hasOwnProperty(section))
			|| (!show_collapsed_only_enable && !fun.array_contains(section_form_collapsed_fields[section], field_name ))
			|| (show_collapsed_only_enable && fun.array_contains(section_form_collapsed_fields[section], field_name )) ) {
			var superscript="";
			if (missing_fields && fun.array_contains(missing_fields, field_name)) superscript='<span style="color:red"><strong>*</strong></span>';
			if (section_form_friendly_names[section].hasOwnProperty(friendly_name)) friendly_name = section_form_friendly_names[section][friendly_name];
			var prefill_value = "";
			if (prefill && (prefill.hasOwnProperty(field_name))) prefill_value = prefill[field_name];
			if (field_lookup_values.hasOwnProperty(field_name)) {
				ret += "\n" + '<div class="form-group">';
				if (show_collapsed_only_enable) ret += "\n" + '  <label class="control-label col-sm-2" style="color:darkgray">'+friendly_name+superscript+':</label>';
				else ret += "\n" + '  <label class="control-label col-sm-2" >'+friendly_name+superscript+':</label>';
				ret += "\n" + '  <div class="col-sm-10">';
				ret += "\n" + '    <div class="btn-group" data-toggle="buttons">';
				var precheck="";
				var precheck_class="";
				for (var choice_i = 0, choice_len = field_lookup_values[field_name].length; choice_i < choice_len; choice_i++) {
					if (prefill_value==field_lookup_values[field_name][choice_i]) {
						precheck=' checked="checked"';// aria-pressed="true" is not required except for button
						precheck_class=' active';
					}
					else {
						precheck='';
						//console.log("prefill_value:"+prefill_value)
						//console.log("  field_lookup_values[field_name][choice_i]:"+field_lookup_values[field_name][choice_i])
					}
					var friendly_name = field_lookup_values[field_name][choice_i];
					ret += "\n" + '      <label class="btn btn-primary'+precheck_class+'"><input type="radio" name="'+field_name+'" value="'+field_lookup_values[field_name][choice_i]+'"'+precheck+'>'+friendly_name+'</label>';
				}
				ret += "\n" + '    </div>';
				ret += "\n" + '  </div>';
				ret += "\n" + '</div>';
			}
			else {
				//console.log("prefill_value:"+prefill_value)
				ret += "\n" + '  <div class="form-group">';
				if (show_collapsed_only_enable) ret += "\n" + '  <label class="control-label col-sm-2" style="color:darkgray">'+friendly_name+superscript+':</label>';
				else ret += "\n" + '  <label class="control-label col-sm-2" >'+friendly_name+superscript+':</label>';
				ret += "\n" + '    <div class="col-sm-10">';
				ret += "\n" + '      <input class="form-control" type="text" name="'+field_name+'" value="'+prefill_value+'"/>';
				ret += "\n" + '    </div>';
				ret += "\n" + '  </div>';
			}
		}
	}    
	return ret;
}

function get_years(section) {
	var table_path = data_dir_path + "/" + section;
	var year_month_string = moment().format("YYYY-MM");
	var years;
	if (!(dat[section]&&dat[section]["years"]) || !listed_year_on_month || (listed_year_on_month!=year_month_string)) {
		listed_year_on_month = year_month_string;
		if (fs.existsSync(table_path)) {
			if (!dat[section]) dat[section] = {};
			years = fun.getVisibleDirectories(table_path);
			dat[section]["years"] = years;
			//for (var y_i = 0; y_i < years.length; y_i++) {
				//var this_year = years[y_i];
				//dat[section][this_year] = {};
			//}
		}
	}
	else years = dat[section]["years"];
	return years;
}

function get_year_buttons_from_cache(section, username) {
	var ret = "";
	var years = get_years(section);
	for (i=0, len=years.length; i<len; i++) {
		ret += '<form action="'+config.proxy_prefix_then_slash+'">';
		ret += '<input type="hidden" name="section" id="section" value="'+section+'"/>';
		ret += '<input type="hidden" name="selected_year" id="selected_year" value="'+years[i]+'" />';
		ret += '<input type="hidden" name="selected_month" id="selected_month" value="(none)" />';
		ret += '<input type="hidden" name="selected_day" id="selected_day" value="(none)" />';
		ret += '<input type="hidden" name="selected_item_key" id="selected_item_key" value="(none)" />';
		if (years[i]==selected_year) {
			ret += '<button class="btn" type="submit">'+years[i]+'</button>';
		}
		else {
			ret += '<button class="btn btn-default" type="submit">'+years[i]+'</button>';
		}
		ret += '</form>';
	}
	return ret;
}

function get_year_month_select_buttons(section, username, years, months, selected_year, selected_month) {
	var ret = "";
	//var years = get_years(section);
	for (i=0, len=years.length; i<len; i++) {
		ret += '<div>Report Year:';
		ret += '<form action="'+config.proxy_prefix_then_slash+'">';
		ret += '<input type="hidden" name="section" id="section" value="'+section+'"/>';
		ret += '<input type="hidden" name="selected_year" id="selected_year" value="'+years[i]+'" />';
		ret += '<input type="hidden" name="selected_month" id="selected_month" value="(none)" />';
		ret += '<input type="hidden" name="selected_day" id="selected_day" value="(none)" />';
		ret += '<input type="hidden" name="selected_item_key" id="selected_item_key" value="(none)" />';
		if (years[i]==selected_year) {
			ret += '<button class="btn" type="submit">'+years[i]+'</button>';
		}
		else {
			ret += '<button class="btn btn-default" type="submit">'+years[i]+'</button>';
		}
		ret += '</form>';
		ret += '</div>';
	}
	ret += '<div>Report Month:';
	for (i=0, len=months.length; i<len; i++) {
		ret += '<form action="'+config.proxy_prefix_then_slash+'">';
		ret += '<input type="hidden" name="section" id="section" value="'+section+'"/>';
		ret += '<input type="hidden" name="selected_year" id="selected_year" value="'+selected_year+'" />';
		ret += '<input type="hidden" name="selected_month" id="selected_month" value="'+months[i]+'" />';
		ret += '<input type="hidden" name="selected_day" id="selected_day" value="(none)" />';
		ret += '<input type="hidden" name="selected_item_key" id="selected_item_key" value="(none)" />';
		if (months[i]==selected_month) {
			ret += '<button class="btn" type="submit">'+months[i]+'</button>';
		}
		else {
			ret += '<button class="btn btn-default" type="submit">'+months[i]+'</button>';
		}
		ret += '</form>';
	}
	ret += '</div>';
	return ret;
}


function good_time_string(human_written_time_string) {
	var result = null;
	if (human_written_time_string) {
		var input_lower = human_written_time_string.toLowerCase().trim();
		var am_i = input_lower.indexOf("am");
		var hour_adder = 0;
		var hour = null;
		var minute = null;
		var second = 0;
		if (am_i>-1) {
			input_lower = input_lower.substring(0, am_i).trim();
		}
		else {
			var pm_i = input_lower.indexOf("pm");
			if (pm_i>-1) {
				hour_adder = 12;
				input_lower = input_lower.substring(0, pm_i).trim();
			}
		}
		var colon_i = input_lower.indexOf(":");
		if (colon_i>-1) {
			hour = parseInt(input_lower.substring(0,colon_i));
			var chunk2 = input_lower.substring(colon_i+1);
			var colon2_i = chunk2.indexOf(":");
			if (colon2_i>-1) {
				second = parseInt(chunk2.substring(colon2_i+1));
				chunk2 = chunk2.substring(0,colon2_i);
			}
			minute = parseInt(chunk2);
		}
		else {
			var n = parseInt(input_lower);
			if (n>23) {
				if (input_lower.length==3) {
					//such as: read 640 as 6:40)
					hour = parseInt(input_lower.substring(0,1));
					minute = parseInt(input_lower.substring(1));
				}
				else if (input_lower.length==4) {
					hour = parseInt(input_lower.substring(0,2));
					minute = parseInt(input_lower.substring(2));
				}
			}
			else {  //if (input_lower.length==1 || input_lower.length==2) {
				hour = n;
				minute = 0;
			}
		}
		if (hour !== null) {
			hour += hour_adder;
			var h_str = hour.toString();
			if (h_str.length<2) h_str = "0" + h_str;
			var m_str = minute.toString();
			if (m_str.length<2) m_str = "0" + m_str;
			var s_str = second.toString();
			if (s_str.length<2) s_str = "0" + s_str;
			result = h_str+":"+m_str+":"+s_str; //assume 0 seconds
		}
	}
	return result;
}

function get_care_time_info(this_item, section) {
	var result = {};
	//NOTE: startTime and endTime define school day
	var foundTime = null;
	var foundTimeString = null;
	var local_time_zone = null;
	if (has_setting("local_time_zone")) local_time_zone = peek_setting("local_time_zone");
	//if (Date.format("HH:mm:ss") > Date.parse("15:05:00"))
	var local_now = moment();
	if (local_time_zone!==null) local_now = moment().tz(local_time_zone);
	else console.log("ERROR: missing local_time_zone setting during get_care_time_info");
	
	// The code below the comment works since both are normally in same timezone.
	// However, there may be issues since timezone offset (in yml) is not checked.	
	
	if (this_item.hasOwnProperty("time")) {
		if (fun.is_not_blank(this_item["time"])) {
			foundTime = moment(this_item["time"], "HH:mm:ss");
			foundTimeString = moment(this_item["time"], "HH:mm:ss").format("HH:mm:ss");
		}
	}
	if (this_item.hasOwnProperty("stated_time")) {
		if (fun.is_not_blank(this_item["stated_time"])) {
			foundTime = moment(good_time_string(this_item["stated_time"]), "HH:mm:ss");
			foundTimeString = foundTime.format("HH:mm:ss");
			result["info"]="stated_time: "+this_item["stated_time"]+" converted to 24-hr format: "+foundTimeString;
		}
	}
	if (foundTime!==null) {
		if (!section) console.log("ERROR: no section given to get_care_time_info");
		if ( //_settings && _settings.hasOwnProperty(section)
			has_setting(section+".local_start_time") //&& _settings[section].hasOwnProperty("local_start_time")
			&& has_setting(section+".local_end_time") //_settings[section].hasOwnProperty("local_end_time")
			) {
			
			var startTime = moment(peek_setting(section+".local_start_time"), "HH:mm:ss");  // var startTime = moment(_settings[section]["local_start_time"], "HH:mm:ss");
			var endTime = moment(peek_setting(section+".local_end_time"), "HH:mm:ss");  // var endTime = moment(_settings[section]["local_end_time"], "HH:mm:ss");
			
			//see also http://momentjs.com/docs/#/manipulating/difference/
			if (foundTimeString > _settings[section]["local_end_time"]) {
				result["seconds"] = foundTime.diff(endTime, 'seconds');
			}
			else if (foundTimeString < _settings[section]["local_start_time"]) {
				result["seconds"] = startTime.diff(foundTime, 'seconds');
			}
			else {
				result["seconds"] = 0;
			}
		}
		else result["error"]=("WARNING: For get_care_time_info, "+section+".local_start_time and "+section+".local_end_time must be set in "+settings_path+" (for building status features, and for extended hours billing feature)");
	}
	else result["seconds"] = 0;
	return result;
}

function get_sheet_function_name(formula) {
	var result = null;
	if (formula && formula.substring(0,1)=="=") {
		var ender_i = formula.indexOf("(");
		if (ender_i>-1) {
			result = formula.substring(1,ender_i).trim();
		}
	}
	return result;
}

function get_sheet_primary_param_name(formula) {
	var result = null;
	if (formula && formula.substring(0,1)=="=") {
		var ender_i = formula.indexOf("(");
		if (ender_i>-1) {
			var op;
			op = formula.substring(1,ender_i).trim();
			var this_key_ender=formula.indexOf(",",ender_i+1);
			if (this_key_ender>-1) {
				result = formula.substring(ender_i+1, this_key_ender);
			}
		}
	}
	return result;
}

function write_record_without_validation(req_else_null, section, date_array_else_null, record, as_username, write_mode, custom_file_name_else_null, autofill_enable) {
	var results = {};
	var indent = "      ";
	//automatically-generated values:
	record.time = moment().format('HH:mm:ss');
	record.ctime = moment().format('YYYY-MM-DD HH:mm:ss Z');
	var local_time_zone = peek_setting("local_time_zone");
	if (local_time_zone!==null) record.tz = local_time_zone;
	else console.log(indent+"ERROR: missing local_time_zone during record save");
	record.tz_offset_mins = moment().utcOffset();
	//unique ones are below
	if (!fs.existsSync(data_dir_path))
		fs.mkdirSync(data_dir_path);
	var signs_dir_name = null;
	
	//write files
	signs_dir_name = section;
	var signs_dir_path = data_dir_path + "/" + signs_dir_name;
	if (!fs.existsSync(signs_dir_path))
		fs.mkdirSync(signs_dir_path);
	var y_dir_name = moment().format("YYYY");
	if (date_array_else_null && date_array_else_null.length>=1) y_dir_name = fun.zero_padded(date_array_else_null[0], 4);
	var stated_date_enable = false;
	if (record.hasOwnProperty("stated_date")) stated_date_enable = true;
	if (stated_date_enable) y_dir_name = record.stated_date.substring(0,4);
	var y_dir_path = signs_dir_path + "/" + y_dir_name;
	if (!fs.existsSync(y_dir_path))
		fs.mkdirSync(y_dir_path);
	var m_dir_name = moment().format("MM");
	if (date_array_else_null && date_array_else_null.length>=2) m_dir_name = fun.zero_padded(date_array_else_null[1], 2);
	if (stated_date_enable) m_dir_name = record.stated_date.substring(5,7);
	var m_dir_path = y_dir_path + "/" + m_dir_name;
	if (!fs.existsSync(m_dir_path))
		fs.mkdirSync(m_dir_path);
	var d_dir_name = moment().format("DD");
	if (date_array_else_null && date_array_else_null.length>=3) d_dir_name = fun.zero_padded(date_array_else_null[2], 2);
	if (stated_date_enable) d_dir_name = record.stated_date.substring(8,10);
	var d_dir_path = m_dir_path + "/" + d_dir_name;
	if (!fs.existsSync(d_dir_path))
		fs.mkdirSync(d_dir_path);
	var dated_path = d_dir_path;
	var out_time_string = moment().format("HHmmss");
	if (fun.is_blank(custom_file_name_else_null)) custom_file_name_else_null = out_time_string + ".yml";
	results.out_name = custom_file_name_else_null;
	var out_path = dated_path + "/" + results.out_name;
	//this callback doesn't work:
	//yaml.write(out_path, record, "utf8", show_notice);
	record.created_by = as_username;
	if (req_else_null) {
		record.created_by_ip = req_else_null.ip;
		record.created_by_ips = req_else_null.ips;
		record.created_by_hostname = req_else_null.hostname;
	}
	//NOTE: _settings[section]["autofill_requires"]["family_id"] = ["first_name", "last_name", "grade"];
	//NOTE: autofill_cache["care"]["qty"]["J&S"] = "2";
	//_settings && _settings.hasOwnProperty(section) && _settings[section].hasOwnProperty("autofill_requires") && _settings[section]["autofill_requires"].hasOwnProperty(req_else_null.body.selected_field)
	if (autofill_enable) autofill(section, record, true);
	var finalize_enable = false;
	if (write_mode=="create") {
		var suffix = 0;
		var file_name_no_ext = fun.without_ext(results.out_name);
		
		while (fs.existsSync(out_path)) {
			suffix += 1; //intentionally start at 1
			results.out_name = file_name_no_ext + "-" + suffix + ".yml";
			out_path = dated_path + "/" + results.out_name;
			console.log(" # trying to find new name "+out_path+"...");
		}
		finalize_enable = true;
		console.log(indent+"(PICKED NAME "+results.out_name+" at "+out_path);
	}
	else if (write_mode=="modify") {
		if (fs.existsSync(out_path)) {
			finalize_enable = true;
		}
		else results.error = "ERROR: Nothing written since in modify mode but file "+out_path+" does not exist.";
	}
	
	if (finalize_enable) {
		console.log(indent+"* WRITING "+out_path);
		yaml.writeSync(out_path, record, "utf8");
		results.out_path = out_path;
		console.log(indent+"  done.");
		
		//write cache
		//NOTE: dat will not exist yet if no user with read priv has loaded a page (even if a user with create/modify loaded a page)
		if (dat) {
			var section = section;
			if (!dat.hasOwnProperty(section)) {
				console.log(indent+"ERROR: section "+section+" is not in cache");
				dat[section]={};
			}
			if (!dat[section].hasOwnProperty(y_dir_name))
				dat[section][y_dir_name]={};
			if (!dat[section].hasOwnProperty("years"))
				dat[section]["years"] = [];
			if (!fun.array_contains(dat[section]["years"], y_dir_name))
				dat[section]["years"].push(y_dir_name);
			
			
			if (!dat[section][y_dir_name].hasOwnProperty(m_dir_name))
				dat[section][y_dir_name][m_dir_name]={};
			if (!dat[section][y_dir_name].hasOwnProperty("months"))
				dat[section][y_dir_name]["months"] = [];
			if (!fun.array_contains(dat[section][y_dir_name]["months"], m_dir_name))
				dat[section][y_dir_name]["months"].push(m_dir_name);
			
			if (!dat[section][y_dir_name][m_dir_name].hasOwnProperty(d_dir_name))
				dat[section][y_dir_name][m_dir_name][d_dir_name] = {};
			if (!dat[section][y_dir_name][m_dir_name].hasOwnProperty("days"))
				dat[section][y_dir_name][m_dir_name]["days"] = [];
			if (!fun.array_contains(dat[section][y_dir_name][m_dir_name]["days"], d_dir_name))
				dat[section][y_dir_name][m_dir_name]["days"].push(d_dir_name);

			dat[section][y_dir_name][m_dir_name][d_dir_name][results.out_name] = record;
			if (!dat[section][y_dir_name][m_dir_name][d_dir_name].hasOwnProperty("item_keys"))
				dat[section][y_dir_name][m_dir_name][d_dir_name]["item_keys"] = [];
			if (!fun.array_contains(dat[section][y_dir_name][m_dir_name][d_dir_name]["item_keys"], results.out_name))
				dat[section][y_dir_name][m_dir_name][d_dir_name]["item_keys"].push(results.out_name);
			//console.log(indent+"CACHE was updated for section "+section+" by adding entry "+results.out_name+" to date "+y_dir_name+"-"+m_dir_name+"-"+d_dir_name);
		}
		//else doesn't matter since cache will be loaded from drive and then be fresh
		
		results.notice = "Saved entry for "+out_time_string.substring(0,2) + ":" + out_time_string.substring(2,4) + ":" + out_time_string.substring(4,6);
		if (record.stated_time) results.notice += " (stated time " + record.stated_time + ")";
	}
	return results;
}

// Configure express to use handlebars templates
var hbs = exphbs.create({
		helpers: {
		remove_audio_message: function() {
			//delete session.runme;
			//not a function: session.destroy("runme");
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
			return (a.hasOwnProperty(name)) ? a.name : "";
		},
		show_settings: function(section, username, selected_setting, opts) {
			var ret = "";
			if (user_has_section_permission(username, section, "settings")) {
				//ret += "\n" + '<form class="form-inline">';
				//ret += "\n" + '  <div class="form-group">';
				//ret += "\n" + '    <label for="fieldHeading" class="sr-only">Email</label>';
				//ret += "\n" + '    <input type="text" readonly class="form-control-plaintext" id="fieldHeading" value="Setting">';
				//ret += "\n" + '  </div>';
				//ret += "\n" + '  <div class="form-group mx-sm-3">';
				//ret += "\n" + '    <label for="inputSettingName" class="sr-only">Name</label>';
				//ret += "\n" + '    <input type="password" class="form-control" id="inputSettingName" placeholder="setting">';
				//ret += "\n" + '  </div>';
				//ret += "\n" + '  <button type="submit" class="btn btn-primary">Save</button>';
				//ret += "\n" + '</form>';
				//ret += "\n"+'<form class="form-inline" id="change-section-settings" action="' + config.proxy_prefix_then_slash + '" method="get">';
				//ret += "\n"+'  <input type="hidden" name="section" id="section" value="'+section+'"/>';
				//ret += "\n"+'  <input type="hidden" name="mode" id="mode" value="settings"/>';
				//ret += "\n"+'  <input class="form-control" size="8" name="selected_setting" id="selected_setting" value="'+selected_setting+'"/>';
				//ret += "\n"+'  <button class="btn btn-default" type="submit">Peek</button>';
				//ret += "\n"+'</form>';
				var settings_keys = get_all_settings_names();
				for (i=0, len=settings_keys.length; i<len; i++) {
					if (settings_keys[i]!=selected_setting) ret += "\n"+'<a href="'+config.proxy_prefix_then_slash+"?selected_setting="+settings_keys[i]+'">'+settings_keys[i]+"</a><br/>";
					else {
						ret += "\n"+'<table>';
						ret += "\n"+'<tbody>';
						ret += "\n"+'<tr>';
						ret += "\n"+'<td>'+settings_keys[i]+"&nbsp;=&nbsp;";
						ret += "\n"+'</td>';
						ret += "\n"+'<td>';
						ret += "\n"+'<form id="change-section-settings" action="' + config.proxy_prefix_then_slash + 'poke-settings" method="post">';
						//ret += '<div class="form-group row">';
						ret += "\n"+'  <input type="hidden" name="section" id="section" value="'+section+'"/>';
						ret += "\n"+'  <input type="hidden" name="mode" id="mode" value="settings"/>';
						ret += "\n"+'  <input type="hidden" name="selected_setting" id="selected_setting" value="'+selected_setting+'"/>';
						//ret += "\n"+'  <label for="selected_setting_value" class="col-sm-2 col-form-label">'+settings_keys[i]+'&nbsp;=&nbsp;</label>';
						
						//ret += "\n"+'    <div class="col-sm-10">';
						ret += "\n"+'  <div class="input-group">';
						ret += "\n"+'      <input class="form-control" size="8" name="selected_setting_value" id="selected_setting_value" value="'+peek_setting(selected_setting)+'"/>';
						//ret += "\n"+'    </div>';
						ret += "\n"+'    <div class="input-group-btn">';
						ret += "\n"+'      <button class="btn btn-default" type="submit">Save</button>';
						ret += "\n"+'    </div>';
						ret += "\n"+'  </div>';
						//ret += '</div>';
						ret += "\n"+'</form>';
						ret += "\n"+'</td>';
						ret += "\n"+'</tr>';
						ret += "\n"+'</tbody>';
						ret += "\n"+'</table>';
					}
				}
			}
			else {
				ret += 'You do not have permission to access this section';
			}
			return new Handlebars.SafeString(ret);
		},
		show_reports: function(section, username, years, months, days, selected_year, selected_month, selected_day, section_report_edit_field, opts) {
			var ret = "";
			if (user_has_section_permission(username, section, "reports")) {
				//ret += '<div class="panel panel-default">';
			
				//ret += '<div class="panel-body">';
				ret += '<table class="table">'; //style="width:100%"
				ret += '<tr>';
				ret += '<td style="width:5%; vertical-align:top; horizontal-align:left">';
				ret += get_year_month_select_buttons(section, username, years, months, selected_year, selected_month);
				ret += '</td>';
				ret += '<td style="vertical-align:top; horizontal-align:left">';
				ret += '	<div style="width:100%; text-align:center">';
				ret += '<br/>';
				var selected_field = null;
				var this_rate = 0.0;
				if (!section) console.log("ERROR: no section given to show_reports"); 
				if ( has_setting(section+".extended_hours_hourly_price") ) { //_settings && _settings.hasOwnProperty(section) && _settings[section].hasOwnProperty("extended_hours_hourly_price")) {//section_rates.hasOwnProperty(section)) {
					var section_friendly_name = section;
					var this_start_time_string = "";
					if (has_setting(section+".local_start_time"))  //if (_settings.hasOwnProperty(section) && _settings[section].hasOwnProperty("local_start_time"))
						this_start_time_string = peek_setting(section+".local_start_time"); // _settings[section]["local_start_time"];
					if (friendly_section_names.hasOwnProperty(section)) section_friendly_name = friendly_section_names[section];
					this_rate = peek_setting(section+".extended_hours_hourly_price"); // _settings["care"]["extended_hours_hourly_price"];//section_rates[section];
					ret += "\n"+'<p>';
					ret += "\n"+'<table class="table">'; //style="vertical-align:top; text-align:left
					ret += "\n"+'<tr>';
					ret += "\n"+'<td>';
					ret += "Hourly Rate for "+section_friendly_name+": ";
					ret += "\n"+'<form class="form-inline" id="change-section-settings" action="' + config.proxy_prefix_then_slash + 'change-section-settings" method="post">';
					ret += "\n"+'  <div class="form-row align-items-center">';
					ret += "\n"+'    <input type="hidden" name="section" id="section" value="'+section+'"/>';
					ret += "\n"+'    <input type="hidden" name="mode" id="mode" value="reports"/>';
					ret += "\n"+'    <input type="hidden" name="selected_setting" id="selected_setting" value="extended_hours_hourly_price"/>';
					//ret += "\n"+'   <div class="col-auto">';
					ret += "\n"+'    <input class="form-control mb-2 mb-sm-0" size="4" name="selected_setting_value" id="selected_setting_value" value="'+this_rate+'"/>';
					//ret += "\n"+'   </div>';
					//ret += "\n"+'   <div class="col-auto">';
					ret += "\n"+'    <button type="submit" class="btn btn-default">Save</button>';
					//ret += "\n"+'   </div>';
					ret += "\n"+'  </div>';
					ret += "\n"+'</form>';
					ret += '</td>';
					ret += "\n"+'<td>';
					ret += " Free from";
					ret += "\n"+'<form class="form-inline" id="change-section-settings" action="' + config.proxy_prefix_then_slash + 'change-section-settings" method="post">';
					ret += "\n"+'  <input type="hidden" name="section" id="section" value="'+section+'"/>';
					ret += "\n"+'  <input type="hidden" name="mode" id="mode" value="reports"/>';
					ret += "\n"+'    <input type="hidden" name="selected_setting" id="selected_setting" value="local_start_time"/>';
					ret += "\n"+'  <input class="form-control" size="8" name="selected_setting_value" id="selected_setting_value" value="'+this_start_time_string+'"/>';
					ret += "\n"+'  <button type="submit" class="btn btn-default"/>Save</button>';
					ret += "\n"+'</form>';
					ret += '</td>';
					ret += "\n"+'</tr>';
					ret += "\n"+'<tr>';
					if (!selected_field) {
						if (section_report_edit_field.hasOwnProperty(section) && section_report_edit_field[section].hasOwnProperty("reports")) {
							selected_field = section_report_edit_field[section]["reports"];
							var selected_field_msg = "null";
							if (selected_field) selected_field_msg=selected_field;
							//console.log("[ _ ] got runtime value reports.selected_field_default: "+selected_field_msg);
						}
						if (!selected_field) {
							if (has_setting(section+".reports.selected_field_default")) {//else {
								selected_field = peek_setting(section+".reports.selected_field_default");
								var selected_field_msg = "null";
								if (selected_field) selected_field_msg=selected_field;
								//console.log("[ . ] got setting reports.selected_field_default: "+selected_field_msg);
								//console.log("      (actually "+_settings[section]["reports"]["selected_field_default"]+")");
								//console.log("      (now "+selected_field+")");
							}
						}
					}
					if ( has_setting(section+".autofill_requires")  // autofill_requires.hasOwnProperty(section)
						&&  ( selected_field || (has_setting(section+".default_groupby")) )  ) {
							//ret += " "+default_groupby[section];
						var this_field = null;
						if (selected_field) this_field = selected_field;
						else if (has_setting(section+".default_groupby"))  
							this_field = peek_setting(section+".default_groupby");
						//else if (default_groupby.hasOwnProperty(section)) this_field = default_groupby[section];
						if (has_setting(section+".autofill_requires."+this_field)) {
							ret += '<td>';
							//ret += " Change entries for person where";
							//ret += ":";
							ret += "\n"+'<form class="form-horizontal" id="update-query" action="' + config.proxy_prefix_then_slash + 'update-query" method="post">';
							ret += "\n"+'  <input type="hidden" name="section" id="section" value="'+section+'"/>';
							ret += "\n"+'  <input type="hidden" name="mode" id="mode" value="reports"/>';
							ret += "\n"+'  <input type="hidden" name="selected_year" id="selected_year" value="'+selected_year+'"/>';
							ret += "\n"+'  <input type="hidden" name="selected_month" id="selected_month" value="'+selected_month+'"/>';
							for (i=0; i<_settings[section]["autofill_requires"][this_field].length; i++) {
								var key = _settings[section]["autofill_requires"][this_field][i];
								var val = "";
								var field_friendly_name = key;
								if (section_sheet_fields_friendly_names.hasOwnProperty(section) && section_sheet_fields_friendly_names[section].hasOwnProperty(key))
									field_friendly_name = section_sheet_fields_friendly_names[section][key]; //shorter than section_form_friendly_names
								ret += "\n" + '  <div class="input-group mb-2 mb-sm-0">';
								ret += "\n" + '  <span class="input-group-addon" >'+field_friendly_name+':</span>';
								//ret += "\n" + '    <div class="col-sm-10">';
								ret += "\n" + '      <input class="form-control" type="text" name="where_'+key+'" id="'+key+'" value="'+val+'"/>';
								//ret += "\n" + '    </div>';
								ret += "\n" + '  </div>';
							}
							ret += "\n"+'  <input type="hidden" name="selected_field" id="selected_field" value="'+this_field+'"/>';
							var field_friendly_name = this_field;
							
							if (section_sheet_fields_friendly_names.hasOwnProperty(section) && section_sheet_fields_friendly_names[section].hasOwnProperty(this_field))
								field_friendly_name = section_sheet_fields_friendly_names[section][this_field];
							
							ret += "\n" + '  <div class="input-group mb-2 mb-sm-0">';
							ret += "\n" + '  <span class="input-group-addon" style="color:darkgreen; font-weight:bold">Change '+field_friendly_name+' to:</span>';
							//ret += "\n" + '    <div class="col-sm-10">';
							ret += "\n" + '      <input class="form-control" type="text" name="set_value" id="set_value" value="'+val+'"/>';
							//ret += "\n" + '    </div>';
							ret += "\n" + '  </div>';
								
							ret += "\n"+'  <button class="btn btn-default" style="color:darkgreen; font-weight:bold" type="submit"/>Change All Matching</button>';
							ret += "\n"+'</form>';
							ret += '</td>';
						}
						else {
							ret += "\n"+'<td>';
							ret += '&nbsp; </td>';
						}
					}
					else {
						ret += "\n"+'<td>';
						ret += '&nbsp; </td>';
					}
					ret += "\n"+'<td>';
					ret += " to ";
					var this_end_time_string = "";
					if (has_setting(section+".local_end_time"))  //if (_settings.hasOwnProperty(section) && _settings[section].hasOwnProperty("local_end_time"))
						this_end_time_string = peek_setting(section+".local_end_time"); //_settings[section]["local_end_time"];
					ret += "\n"+'<form class="form-inline" id="change-section-settings" action="' + config.proxy_prefix_then_slash + 'change-section-settings" method="post">';
					ret += "\n"+'  <input type="hidden" name="section" id="section" value="'+section+'"/>';
					ret += "\n"+'  <input type="hidden" name="mode" id="mode" value="reports"/>';
					ret += "\n"+'  <input type="hidden" name="selected_setting" id="selected_setting" value="local_end_time"/>';
					ret += "\n"+'  <input class="form-control" size="8" name="selected_setting_value" id="selected_setting_value" value="'+this_end_time_string+'"/>';
					ret += "\n"+'  <button class="btn btn-default" type="submit">Save</button>';
					ret += "\n"+'</form>';
					ret += "\n"+'</td>';
					ret += "\n"+'</tr>';
					ret += "\n"+'<tr>';
					if (selected_field) {//section_report_edit_field.hasOwnProperty(section)) {
						if (!section_report_edit_field.hasOwnProperty(section)) section_report_edit_field[section] = {};
						if (!section_report_edit_field[section].hasOwnProperty("reports")) section_report_edit_field[section]["reports"] = selected_field;
						//if (!peek_setting(section+".reports.selected_field_default")) {
						//	console.log("  setting reports.selected_field_default to "+selected_field);
						//	poke_setting(section+".reports.selected_field_default", selected_field);
						//}
						ret += "\n"+'<td>'; //no longer needed
						ret += "&nbsp;";
						//ret += "Selected Field:";
						//ret += "\n"+'<form class="form-inline" id="change-section-settings" action="' + config.proxy_prefix_then_slash + 'change-selection" method="get">';
						//ret += "\n"+'  <input type="hidden" name="section" id="section" value="'+section+'"/>';
						//ret += "\n"+'  <input type="hidden" name="mode" id="mode" value="reports"/>';
						//ret += "\n"+'  <input class="form-control" size="8" name="change_section_report_edit_field" id="change_section_report_edit_field" value="'+section_report_edit_field[section]["reports"]+'"/>';
						//ret += "\n"+'  <button class="btn btn-default" type="submit">Select</button>';
						//ret += "\n"+'</form>';
						ret += '</td>';
					}
					else {
						ret += "\n"+'<td>';
						ret += '&nbsp;'; //no longer needed either
						ret += '</td>';
					}
					ret += "\n"+'<td>';
					ret += "\n"+'&nbsp; </td>';
					ret += "\n"+'</tr>';
					ret += "\n"+'</table>';
					ret += "</p>";
					
				}
				else {
					ret += '<!--no hourly rate specified for section '+section+'-->';
				}
				ret += '</td>';
				ret += '</tr>';
				ret += '</table>';
				if (selected_month) {
					if (section_sheet_fields.hasOwnProperty(section)) {
						var parsing_info = "";
						var parsing_error = "";
						var items = [];
						ret += "\n"+'<table class="table table-bordered">';
						ret += "\n"+'  <thead>';
						ret += "\n"+'    <tr>';
						
						var url_params = "?";
						url_params += "section="+section+"&";
						url_params += "mode=reports&";
							
						for (i=0, len=section_sheet_fields[section].length; i<len; i++) {
							var key = section_sheet_fields[section][i];
							var name = key;
							if (selected_field==key) ret += "\n"+'      <th class="bg-info">';
							else ret += "\n"+'      <th>';
							if (section_sheet_fields_friendly_names.hasOwnProperty(section) && section_sheet_fields_friendly_names[section].hasOwnProperty(key)) {
								name = section_sheet_fields_friendly_names[section][key];
							}
							if (default_total.hasOwnProperty(section)) {
								if (key==default_total[section]) name = "Total " + name;
							}
							
							var override_key = null;
							if (section_fields_overrides.hasOwnProperty(section)) {
								for (var this_key in section_fields_overrides[section]) {
									if (this_key==key) {
										override_key = section_fields_overrides[section][this_key];
										break;
									}
								}
							}
							if (override_key===null) override_key = key;
							var href = config.proxy_prefix_then_slash+"change-selection"+url_params+"change_section_report_edit_field="+override_key;
							if (selected_field==key || key.startsWith("=")|| key.endsWith("_by")) ret += name;
							else ret += '<a href="'+href+'">'+name+'</a>';
							ret += '</th>';
						}
						ret += "\n"+'    </tr>';
						ret += "\n"+'  </thead>';
						ret += "\n"+'  <tbody>';

						
						var table_path = data_dir_path + "/" + section;
						var y_path = table_path + "/" + selected_year;
						var m_path = y_path + "/" + selected_month;
						for (var day_i=0; day_i<days.length; day_i++) {
							var selected_day = days[day_i];
							var d_path = m_path + "/" + selected_day;
							if (fs.existsSync(d_path)) {
								item_keys = fun.getVisibleFiles(d_path);
								if (!dat[section][selected_year][selected_month][selected_day]) dat[section][selected_year][selected_month][selected_day]={};
								dat[section][selected_year][selected_month][selected_day]["item_keys"] = item_keys;
								//console.log("## ITEM KEYS: "+fun.to_ecmascript_value(item_keys));
								//console.log("(ITEM KEYS.length:"+item_keys.length+")");
								//console.log("## ITEMS:"+items);
								var msg = "";
								//for (var item_key_i = 0; item_key_i < item_keys.length; item_key_i++) {
								for (var item_key_i in item_keys) {
									//NOTE: there is no per-day html since that doesn't matter (unless date should be shown)
									//ret += "\n"+'    <tr>';
									var item_key = item_keys[item_key_i];
									var item_path = d_path + "/" + item_key;
									//console.log("  - "+item_key);
									dat[section][selected_year][selected_month][selected_day][item_key] = {};
									if (fs.statSync(item_path).isFile()) {
										try {
											dat[section][selected_year][selected_month][selected_day][item_key] = yaml.readSync(item_path, "utf8");
											dat[section][selected_year][selected_month][selected_day][item_key].key = item_key;
											//dat[section][selected_year][selected_month][selected_day][this_item] = yaml.readSync(item_path, "utf8");
											//var this_item = dat[section][selected_year][selected_month][selected_day][item_key];
											var this_item = JSON.parse(JSON.stringify(dat[section][selected_year][selected_month][selected_day][item_key]));
											this_item.year = selected_year;
											this_item.month = selected_month;
											this_item.day = selected_day;
											for (var i=0, len=section_sheet_fields[section].length; i<len; i++) {
												//ret += "\n"+'      <td>';
												var key = section_sheet_fields[section][i];
												//NOTE: intentionally gets desired fields only
												
												if (key.substring(0,1)=="=") {
													var ender_i = key.indexOf("(");
													if (ender_i>-1) {
														var op = key.substring(1,ender_i).trim();
														if (op=="careprice") {
															var span_info = get_care_time_info(this_item, section);
															if (span_info.hasOwnProperty("seconds")) {
																this_item["=careprice()"] = (span_info["seconds"].toFixed(0)/60.0/60.0 * this_rate).toFixed(2);
																if (span_info.hasOwnProperty("info")) parsing_info += "\n<br/>NOTE: " + span_info["info"] + " in " + item_path;
															}
															else {
																this_item["=careprice()"] = 0.00;
																parsing_error += "\n<br/>";
																if (span_info.hasOwnProperty("error")) {
																	if (parsing_error.indexOf(span_info["error"])<0) parsing_error+=span_info["error"];
																}
															}
														}
														else if (op=="caretime") {
															var span_info = get_care_time_info(this_item, section);
															if (span_info.hasOwnProperty("seconds")) {
																this_item["=caretime()"] = span_info["seconds"];
															}
														}
														else if (op=="caretime_m") {
															var span_info = get_care_time_info(this_item, section);
															if (span_info.hasOwnProperty("seconds")) {
																this_item["=caretime_m()"] = span_info["seconds"]/60.0;
															}
														}
														else if (op=="caretime_h") {
															var span_info = get_care_time_info(this_item, section);
															if (span_info.hasOwnProperty("seconds")) {
																this_item["=caretime_h()"] = (span_info["seconds"]/60.0/60.0).toFixed(3);
															}
														}
														else if (op=="get_date_from_path") {
															this_item["=get_date_from_path()"] = selected_year+"-"+selected_month+"-"+selected_day;
														}
														else if (op=="get_day_from_path") {
															this_item["=get_day_from_path()"] = selected_day;
														}
													}
													else {
														console.log("undefined function :" + key);
													}
												}
												else if (this_item.hasOwnProperty(key)) {
												//if (this_item.hasOwnProperty(key)) {
													var val = this_item[key];
													//ret += val;
													//var val = items[key];
													//console.log("    " + key + ": " + val);
												}
												//ret += '</td>';
											}
											items.push(this_item);
										}
										catch (err) {
											msg += "\n<br/>Could not finish reading "+item_path+": "+err;
										}
									}
									else {
										msg += " ...missing file "+item_path+" ";
									}
									//ret += "\n"+'    </tr>';
								}//end for item keys
								
								if (msg.length>0) {
									//res.session.error=msg;
									console.log(msg);
									ret += '<div class="alert alert-danger">'+msg+'</div>';
								}
							}
							else console.log("Invalid path resulting in stale days array: '"+d_path+"'");
						}//end for days
						var hdv_field_name = null;
						var hdv_item_splitter_name = null;
						if (has_setting(section+".list_implies_qty")) hdv_field_name = peek_setting(section+".list_implies_qty");
						if (hdv_field_name===null) console.log("[ verbose message ] no "+"settings."+section+".list_implies_qty");
						if (has_setting(section+".list_implies_multiple_entries")) hdv_item_splitter_name = peek_setting(section+".list_implies_multiple_entries");
						if (hdv_item_splitter_name===null) console.log("[ verbose message ] no "+section+".list_implies_multiple_entries");
						for (var item_i=0, items_len=items.length; item_i<items_len; item_i++) {
							var item = items[item_i];
							var item_enable = (!item.hasOwnProperty("active") || (typeof(item.active)=="string" && item.active.trim().toLowerCase()=="true") || item["active"]===true);
							ret += "\n"+'    <tr>';
							for (var i=0, len=section_sheet_fields[section].length; i<len; i++) {
								ret += "\n"+'      <td>';
								var a_name = 'scrollto'+i;
								ret += '<a name="'+a_name+'"></a>';
								if (!item_enable) ret += '<span class="text-muted" style="text-decoration:line-through;">';
								var column_name = section_sheet_fields[section][i];
								//NOTE: intentionally gets desired fields only
								var val = "";
								if (item.hasOwnProperty(column_name)) {
									val = item[column_name];
									if (selected_field==column_name) {
										//don't show value yet if selected (see below)
									}
									else ret += val;
								}
								if (selected_field==column_name) { //show even if does NOT have property
									ret += "\n"+'<form class="form-horizontal" id="change-microevent-field" action="' + config.proxy_prefix_then_slash + 'change-microevent-field" method="post">';
									ret += "\n"+'  <input type="hidden" name="scroll_to_named_a" id="scroll_to_named_a" value="'+a_name+'"/>';
									ret += "\n"+'  <input type="hidden" name="section" id="section" value="'+section+'"/>';
									ret += "\n"+'  <input type="hidden" name="mode" id="mode" value="reports"/>';
									ret += "\n"+'  <input type="hidden" name="selected_year" id="selected_year" value="'+item.year+'"/>';
									ret += "\n"+'  <input type="hidden" name="selected_month" id="selected_month" value="'+item.month+'"/>';
									ret += "\n"+'  <input type="hidden" name="selected_day" id="selected_day" value="'+item.day+'"/>';
									ret += "\n"+'  <input type="hidden" name="selected_key" id="selected_key" value="'+item.key+'"/>';
									ret += "\n"+'  <input type="hidden" name="selected_field" id="selected_field" value="'+selected_field+'"/>';
									ret += "\n"+'  <input name="set_value" id="set_value" value="'+val+'"/>';
									ret += "\n"+'  <button class="btn btn-default" type="submit">Save</button>';
									ret += "\n"+'</form>';
								}
								
								if (item_enable) {
									if (hdv_item_splitter_name && (column_name==hdv_item_splitter_name)) {
										var subvalues = fun.get_human_delimited_values(item[hdv_item_splitter_name]);
										if (subvalues && (subvalues.length>1)) {
											ret += "\n"+'<form id="change-microevent-field" action="' + config.proxy_prefix_then_slash + 'split-entry" method="post">';
											ret += "\n"+'  <input type="hidden" name="scroll_to_named_a" id="scroll_to_named_a" value="'+a_name+'"/>';
											ret += "\n"+'  <input type="hidden" name="section" id="section" value="'+section+'"/>';
											ret += "\n"+'  <input type="hidden" name="mode" id="mode" value="reports"/>';
											ret += "\n"+'  <input type="hidden" name="selected_year" id="selected_year" value="'+item.year+'"/>';
											ret += "\n"+'  <input type="hidden" name="selected_month" id="selected_month" value="'+item.month+'"/>';
											ret += "\n"+'  <input type="hidden" name="selected_day" id="selected_day" value="'+item.day+'"/>';
											ret += "\n"+'  <input type="hidden" name="selected_key" id="selected_key" value="'+item.key+'"/>';
											ret += "\n"+'  <input type="hidden" name="selected_field" id="selected_field" value="'+column_name+'"/>';
											//ret += "\n"+'  <input type="hidden" name="set_value" id="set_value" value="'++'"/>';
											ret += "\n"+'  <input type="hidden" name="expected_count" id="expected_count" value="'+subvalues.length+'"/>';
											ret += "\n"+'  <button class="btn btn-danger" type="submit">Split into '+subvalues.length+' entries</button>';
											ret += "\n"+'</form>';
										}
									}
									else if (fun.is_blank(item[column_name]) && hdv_field_name && (column_name=="qty")) {
										
										var hdv_subvalues = null;
										if (hdv_item_splitter_name) hdv_subvalues = fun.get_human_delimited_values(item[hdv_item_splitter_name]);
										if (!hdv_subvalues || hdv_subvalues.length==1) { //only use qty if no splitter overrides qty
											var subvalues = fun.get_human_delimited_values(item[hdv_field_name]);
											if (subvalues && subvalues.length>1) {
												ret += "\n"+'<form id="change-microevent-field" action="' + config.proxy_prefix_then_slash + 'change-microevent-field" method="post">';
												ret += "\n"+'  <input type="hidden" name="scroll_to_named_a" id="scroll_to_named_a" value="'+a_name+'"/>';
												ret += "\n"+'  <input type="hidden" name="section" id="section" value="'+section+'"/>';
												ret += "\n"+'  <input type="hidden" name="mode" id="mode" value="reports"/>';
												ret += "\n"+'  <input type="hidden" name="selected_year" id="selected_year" value="'+item.year+'"/>';
												ret += "\n"+'  <input type="hidden" name="selected_month" id="selected_month" value="'+item.month+'"/>';
												ret += "\n"+'  <input type="hidden" name="selected_day" id="selected_day" value="'+item.day+'"/>';
												ret += "\n"+'  <input type="hidden" name="selected_key" id="selected_key" value="'+item.key+'"/>';
												ret += "\n"+'  <input type="hidden" name="selected_field" id="selected_field" value="qty"/>'; //SET qty
												ret += "\n"+'  <input type="hidden" name="set_value" id="set_value" value="'+subvalues.length+'"/>';
												ret += "\n"+'  <button class="btn btn-warning" type="submit">Set to '+subvalues.length+'</button>';
												ret += "\n"+'</form>';
											}
										}
									}
								}
								
								if (!item_enable) ret += '</span>';
								ret += '</td>';
							}
							ret += "\n"+'    </tr>';
						}
						ret += "\n"+'  </tbody>';
						ret += "\n"+'</table>';
						ret += '<div class="alert alert-info">'+'finished reading '+items.length+' item(s)'+'</div>';
						if (parsing_info.length>0) ret += '<div class="alert alert-info">'+parsing_info+'</div>';
						if (parsing_error.length>0) ret += '<div class="alert alert-error">'+parsing_error+'</div>';

					}
					else {
						ret += '<div class="alert alert-info">'+'There is no table layout for the '+section+' section.'+'</div>';
					}
				}
				else {
					if (selected_year) ret += "(select a month)";
					else ret += "(select a year and month)";
				}
				//ret += '</div>';//end "panel-body"
				//ret += '</div>';//end "panel panel-default"
			}
			else {
				ret += 'You do not have permission to access this section';
			}
			return new Handlebars.SafeString(ret);
		},
		get_section_form: function(section, mode, username, prefill, missing_fields, opts) {
			//aka get_form
			//globals of note:
			//section_required_fields["care"] = ["first_name", "last_name", "chaperone", "grade_level"];
			//section_form_fields["care"] = ["first_name", "last_name", "chaperone", "grade_level", "family_id", "stated_time", "stated_date"];
			//field_lookup_values["heading"] = ["in", "out"]
			//section_form_collapsed_fields["care"] = ["family_id", "stated_time", "stated_date"];
			//section_form_friendly_names["care"]["first_name"] = "Student First Name";
			//prefill_data_by_user
			if (!prefill) {
				prefill={}; //prevent crashes related to "in" keyword
				console.log("WARNING: prefill was false in get_section_form");
			}
			var ret = "No form implemented ("+section+")";
			if (section_form_fields.hasOwnProperty(section)) {
				//console.log("get_section_form...");
				//for (var index in prefill) {
				//    if (prefill.hasOwnProperty(index)) {
				//        console.log("_ (get_section_form) prefill."+index + " is in session with value "+prefill[index]);
				//    }
				//}
				ret = "\n"+'<form class="form-horizontal" id="student-microevent" action="' + config.proxy_prefix_then_slash + 'student-microevent" method="post">';
				
				ret += "\n" + '  <input type="hidden" name="section" value="'+section+'"/>';
				if (!(prefill.hasOwnProperty("mode"))) {
					ret += "\n" + '  <input type="hidden" name="mode" id="mode" value="create"/>';
				}
				else {
					ret += "\n" + '  <input type="hidden" name="mode" id="mode" value="'+prefill["mode"]+'"/>';
				}
				
				//for (index in section_form_fields[section]) {
				ret += get_filtered_form_fields_html(section, mode, username, false, prefill, missing_fields);
				ret += '  <div class="form-group">';
				ret += '    <div class="col-sm-10" style="text-align:center">';
				var friendly_action_name = "Enter";
				if (mode && (friendly_mode_action_text.hasOwnProperty(mode))) friendly_action_name=friendly_mode_action_text[mode];
				ret += '      <button type="submit" class="btn btn-primary btn-sm">'+friendly_action_name+'</button>';
				var more_fields_html = get_filtered_form_fields_html(section, mode, username, true, prefill, missing_fields);
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
			else {
				console.log("WARNING: There is no form for section " + section);
			}
			return new Handlebars.SafeString(ret); // mark as already escaped (so that literal html can be pushed) -- normally new Handlebars.SafeString
		},
		eachProperty: function(context, options) {
			//see Ben on https://stackoverflow.com/questions/9058774/handlebars-mustache-is-there-a-built-in-way-to-loop-through-the-properties-of
			//NOTE: This is needed since builtin each didn't work though according to  "each" can iterate objects as @key : {{this}} (whereas array is iterated as @index : {{this}})
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
		createGroupContains: function(section, username, opts) {
			if (user_has_section_permission(username, section, "create"))
				return opts.fn(this);
			else
				return opts.inverse(this);
		},
		groupContains: function(groupname, username, opts) {
			if (_groups.hasOwnProperty(groupname)) {
				if (fun.array_contains(_groups[groupname], username)) {
					//console.log(groupname+" contains "+username);
					return opts.fn(this);
				}
				else {
					//console.log(groupname+" does not contain "+username);
					return opts.inverse(this);
				}
			}
			else {
				console.log("_groups does not contain "+groupname);
				return opts.inverse(this);
			}
		},
		readGroupContains: function(section, username, opts) {
			if (user_has_section_permission(username, section, "read"))
				return opts.fn(this);
			else
				return opts.inverse(this);
		},
		modifyGroupContains: function(section, username, opts) {
			if (user_has_section_permission(username, section, "modify"))
				return opts.fn(this);
			else
				return opts.inverse(this);
		},
		reportsGroupContains: function(section, username, opts) {
			if (user_has_section_permission(username, section, "reports"))
				return opts.fn(this);
			else
				return opts.inverse(this);
		},
		friendlyModeName: function(needle, opts) {
			if (friendly_mode_names.hasOwnProperty(needle))
				return friendly_mode_names[needle];
			else
				return needle;
		},
		friendlySectionName: function(needle, opts) {
			if (friendly_section_names.hasOwnProperty(needle))
				return friendly_section_names[needle];
			else
				return needle;
		},
		//isReadableByUser: function(section, user, opts) {
		//	if (fun.array_contains(, ))
		//		return opts.fn(this);
		//	else
		//		return opts.inverse(this);
		//},
		isOnlyEmployeeReadSection: function(needle, opts) {
			if (fun.array_contains(only_employee_read_sections, needle))
				return opts.fn(this);
			else
				return opts.inverse(this);
		},
		isOnlyEmployeeModifySection: function(needle, opts) {
			if (fun.array_contains(only_employee_modify_sections, needle))
				return opts.fn(this);
			else
				return opts.inverse(this);
		},
		is_after_school: function(section, opts) {
			if (!section) console.log("ERROR: no section given to is_before_school");
			if (has_setting(section+".local_end_time")) {
				var local_time_zone = null;
				if (has_setting("local_time_zone")) local_time_zone = peek_setting("local_time_zone");
				//if (Date.format("HH:mm:ss") > Date.parse("15:05:00"))
				var local_now = moment();
				if (local_time_zone!==null) local_now = moment().tz(local_time_zone);
				else console.log("ERROR: missing local_time_zone setting during is_after_school");
				//old way (doesn't work for some reason--can't find current timezone from os) local_now.local();
				var now_date_string = local_now.format("YYYY-MM-DD");
				var currentTimeString = local_now.format("HH:mm:ss");  // moment('11:00p', "HH:mm a");
				var tmp_local_end_date = now_date_string+" "+peek_setting(section+".local_end_time");
				//console.log("tmp_local_end_date:"+tmp_local_end_date);
				var endTime = moment(tmp_local_end_date); //, "HH:mm:ss"; // var endTime = moment(_settings[section]["local_end_time"], "HH:mm:ss");
				var endTimeString = endTime.format("HH:mm:ss");			
				//console.log("UTC Offset (minutes): "+local_now.utcOffset()); 
				//console.log("Z: "+local_now.format("Z"));  for example, in EST, outputs -4:00 during Eastern Daylight Time, -5:00 the rest of the year
				//if (!endTime.isAfter(local_now)) {
				if (currentTimeString >= endTimeString) {
					//console.log("is_after_school: yes, now " + currentTimeString + " >= " + endTimeString);
					//console.log("is_after_school: " + endTime.format("HH:mm:ss") + " is not after " + moment().format("HH:mm:ss"));
					return opts.fn(this);
				}
				else {
					//console.log("is_after_school: no, now " + currentTimeString + " < " + endTimeString);
					//console.log("is_after_school: " + endTime.format("HH:mm:ss") + " is after " + moment().format("HH:mm:ss"));
					return opts.inverse(this);
				}
			}
			else {
				console.log("WARNING: missing "+section+".local_end_time");
				return opts.inverse(this);
			}
		},
		is_before_school: function(section, opts) {
			if (!section) console.log("ERROR: no section given to is_before_school");
			if (has_setting(section+".local_start_time")) {
				var local_time_zone = null;
				if (has_setting("local_time_zone")) local_time_zone = peek_setting("local_time_zone");
				else console.log("ERROR: missing local_time_zone setting during is_before_school");
				//if (Date.format("HH:mm:ss") > Date.parse("15:05:00"))
				var local_now = moment();
				if (local_time_zone!==null) local_now = moment().tz(local_time_zone);
				else console.log("ERROR: missing local_time_zone setting");
				var now_date_string = local_now.format("YYYY-MM-DD");
				var currentTimeString = local_now.format("HH:mm:ss");  // moment('11:00p', "HH:mm a");
				var tmp_local_start_date = now_date_string+" "+peek_setting(section+".local_start_time");
				//console.log("tmp_local_start_date:"+tmp_local_start_date);
				var startTime = moment(tmp_local_start_date); //, "HH:mm:ss" // var endTime = moment(_settings[section]["local_end_time"], "HH:mm:ss");
				var startTimeString = startTime.format("HH:mm:ss");
				
				//if (startTime.isAfter(local_now)) {
				if (currentTimeString < startTimeString) {
					//console.log("is_before_school: yes, now " + currentTimeString + " < " + startTimeString);
					//console.log("is_before_school: " + startTime.format("HH:mm:ss") + " is after " + local_now.format("HH:mm:ss"));
					return opts.fn(this);
				}
				else {
					//console.log("is_before_school: no, now " + currentTimeString + " >= " + startTimeString);
					//console.log("is_before_school: " + startTime.format("HH:mm:ss") + " is not after " + local_now.format("HH:mm:ss"));
					return opts.inverse(this);
				}
			}
			else {
				console.log("WARNING: missing "+section+".local_end_time");
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
		//get_startup_js_code: function(opts) {
		//	return session.runme;
		//},
		show_history: function(section, objects, opts) {
			var ret = "";
			if (has_setting(section+".history_sheet_fields")) {
				var fields = peek_setting(section+".history_sheet_fields");
				if (fields !== null) {
					ret += "\n"+'<table class="table">';
					ret += "\n"+'<thead class="thead-default">';
					ret += "\n"+"<tr>";
					for (var j=0, j_len=fields.length; j<j_len; j++) {
						ret += "\n"+"<th>";
						var key = fields[j];
						var name = key;
						var param_name = get_sheet_primary_param_name(key);
						if (param_name) {
							if (section_sheet_fields_friendly_names.hasOwnProperty(section) && section_sheet_fields_friendly_names[section].hasOwnProperty(param_name))
								name = section_sheet_fields_friendly_names[section][param_name];
							else name = param_name;
						}
						else {
							var function_name = get_sheet_function_name(key);
							if (function_name) {
								var function_key = "="+function_name;
								if (section_sheet_fields_friendly_names.hasOwnProperty(section) && section_sheet_fields_friendly_names[section].hasOwnProperty(function_key))
									name = section_sheet_fields_friendly_names[section][function_key];
							}
							else {
								if (section_sheet_fields_friendly_names.hasOwnProperty(section) && section_sheet_fields_friendly_names[section].hasOwnProperty(key))
									name = section_sheet_fields_friendly_names[section][key];
							}
						}
						if (name) ret += name;
						else ret += "&nbsp;";
						ret += "\n"+"</th>";
					}
					ret += "\n"+"</tr>";
					ret += "\n"+'</thead">';
					ret += "\n"+'<tbody>';
					for (i=0, len=objects.length; i<len; i++) {
						ret += "\n"+"<tr>";
						for (var j=0, j_len=fields.length; j<j_len; j++) {
							var key = fields[j];
							ret += "\n"+"<td>";
							if (key.substring(0,1)=="=") {
								var formula = key;
								var ender_i = formula.indexOf("(");
								if (ender_i>-1) {
									var op = formula.substring(1,ender_i).trim();
									var params_end_i=formula.indexOf(")",ender_i+1);
									if (params_end_i>-1) {
										var params = formula.substring(ender_i+1, params_end_i).split(",");
										if (op=="mid") {
											if (params && params.length==3) {
												params[1] = parseInt(params[1]);
												params[2] = parseInt(params[2]);
												var formula_result = params[0].substring(params[1]-1,params[2]); //+1 since sheet formulas use counting numbers; but don't add to last param since end is inclusive
												//ret += formula_result;
												if (objects[i].hasOwnProperty(params[0])) ret += objects[i][params[0]].substring(params[1]-1,params[2]);
												else ret += "&nbsp;"; //value doesn't exist in object, so leave blank
											}
											else {
												ret += "=("+op+" [missing param])";
											}
										}
										else {
											ret += "=[?](...)";
										}
									}
									else ret += "missing &lsquo;)&rsquo;";
								}
								else {
									ret += "=?";
								}
							}
							else if (section_fields_overrides.hasOwnProperty(section)
							                                               &&section_fields_overrides[section].hasOwnProperty(key)
							                                               &&objects[i].hasOwnProperty(section_fields_overrides[section][key])
							                                               &&fun.is_not_blank(objects[i][section_fields_overrides[section][key]])) {
								ret += objects[i][section_fields_overrides[section][key]];
							}
							else if (objects[i].hasOwnProperty(key)) {
								ret += objects[i][key];
							}
							else ret += "&nbsp;";//"[?<!--"+key+"-->]";
							ret += "</td>";
						}
						ret += "\n"+"</tr>";
					}
					ret += "\n"+'</tbody>';
					ret += "\n"+"</table>";
				}
				else ret = section+" section has no history fields list.";
			}

			return new Handlebars.SafeString(ret);
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
	if (req.query.hasOwnProperty("clear_selection") && (req.query.clear_selection=="true")) {
		//see also "stale selection" logic, elsewhere
		for (var key in req.session) {
			if (req.session.hasOwnProperty(key)) {
				if (key.startsWith("selected_")) {
					delete req.session[key];
				}
			}
		}
	}
	if (autofill_cache===null) {
		if (fs.existsSync(autofill_cache_path)) {
			if (autofill_cache_format=="yml") autofill_cache = yaml.readSync(autofill_cache_path, "utf8");
			else autofill_cache = JSON.parse(fs.readFileSync(autofill_cache_path, 'utf8'));
		}
		else {
			console.log("[ @ ] loaded default autofill_cache");
			autofill_cache = JSON.parse(JSON.stringify(default_autofill_cache));
		}
	}
	if (_settings===null) {
		if (fs.existsSync(settings_path)) _settings = yaml.readSync(settings_path, "utf8");
		else {
			_settings = JSON.parse(JSON.stringify(_settings_default));
			//yaml.writeSync(settings_path, _settings, "utf8");
			//console.log("[ . ]: No settings file, so app.get('/') saved defaults to new settings file.");
			yaml.write(settings_path, _settings, "utf8", function (err) {
			if (err) {
				console.log("[ . ] Error while saving settings after loading defaults (did not exist in app.get('/')): " + err);
			}
			else console.log("[ . ]: No settings file, so app.get('/') saved defaults to new settings file.");
		}); 
		}
	}
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
	if (!(req.session.hasOwnProperty("prefill"))) req.session.prefill={};
	if (req.user && req.user.username) {
		var preload_table_names = sections; //["care","commute"];
		for (var index in preload_table_names) {
			if (preload_table_names.hasOwnProperty(index)) {
				var val = preload_table_names[index];
				if ( user_has_section_permission(req.user.username, val, "create") || user_has_section_permission(req.user.username, val, "read") || user_has_section_permission(req.user.username, val, "modify") ) {
					user_sections.push(val);
					if (!user_modes_by_section.hasOwnProperty(val)) user_modes_by_section[val] = [];
					if (user_has_section_permission(req.user.username, val, "create")) {
						user_modes_by_section[val].push("create");
					}
					if (user_has_section_permission(req.user.username, val, "read")) {
						user_modes_by_section[val].push("read");
					}
					if (user_has_section_permission(req.user.username, val, "modify")) {
						user_modes_by_section[val].push("modify");
					}
					if (user_has_section_permission(req.user.username, val, "reports")) {
						user_modes_by_section[val].push("reports");
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
		if (section_sheet_fields.hasOwnProperty(section)) {
			for (var indexer in section_sheet_fields[section]) {
				var val = section_sheet_fields[section][indexer];
				this_sheet_field_names.push(val);
				if (section_sheet_fields_friendly_names[section].hasOwnProperty(val)) val = section_sheet_fields_friendly_names[section][val];
				this_sheet_field_friendly_names.push(val);
			}
		}
		if (user_modes_by_section.hasOwnProperty(section)) {
			for (var indexer in user_modes_by_section[section]) { //for (group in user_modes_by_section["section"]) {
				if (!fun.array_contains(transient_modes, user_modes_by_section[section][indexer])) {
					user_selectable_modes.push(user_modes_by_section[section][indexer]);
					//console.log("+ selectable_mode : "+user_modes_by_section[section][indexer]);
				}
			}
		}
		//else console.log("no "+val+" in user_modes_by_section");
	}

	if (fun.is_not_blank(req.query.mode)) {
		mode = req.query.mode;
		req.session.mode = mode;
	}
	else if (fun.is_not_blank(req.session.mode)) {
		mode = req.session.mode;
	}
	else if (user_selectable_modes && (user_selectable_modes.length>=1)) {
		if (req.user && req.user.username && (default_mode_by_user.hasOwnProperty(req.user.username))) mode=default_mode_by_user[req.user.username];
		else mode = user_selectable_modes[user_selectable_modes.length-1];
		req.session.mode = mode;
	}
	
	var prefill_mode = ""; //differs from prefill.mode in that prefill_mode specifies what mode the form should post as
	if (fun.is_not_blank(req.query.prefill_mode)) {
		prefill_mode = req.query.prefill_mode;
		req.session.prefill_mode = prefill_mode;
	}
	if (fun.is_not_blank(req.body.prefill_mode)) {
		prefill_mode = req.body.prefill_mode;
		req.session.prefill_mode = prefill_mode;
	}
	else if ((req.session.prefill.hasOwnProperty("prefill_mode")) && fun.is_not_blank(req.session.prefill.prefill_mode)) {
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
		if (!req.session.section_report_edit_field) req.session.section_report_edit_field = {};
		req.session.section = section;
		if (req.user && req.user.username) {
			if (user_has_section_permission(req.user.username, section, "read") || user_has_section_permission(req.user.username, section, "reports")) {
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
						years = fun.getVisibleDirectories(table_path);
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
							months = fun.getVisibleDirectories(y_path);
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
						
						var m_path = y_path + "/" + selected_month;
						if (!fs.existsSync(m_path)) {
							//stale selection
							console.log("* cleared stale month selection "+selected_month+" from other section or year (that isn't in "+selected_year+" in "+section+")");
							if (req.session.hasOwnProperty("selected_month")) delete req.session.selected_month;
							else console.log("WARNING: stale selected_month "+selected_month+" stuck from another section or year doesn't exist in this "+selected_year+" in "+section);
							selected_month = null;
						}
						if (selected_month) {
							
							if (!(dat[section][selected_year][selected_month]&&dat[section][selected_year][selected_month]["days"])
									|| !listed_day_on_date || listed_day_on_date!=date_string) {
								listed_day_on_date=date_string;
								days = fun.getVisibleDirectories(m_path);
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
								//subs = fun.getVisibleDirectories(d_path);
								//NOTE: fs.readdir is ASYNC! use fun.getVisibleFiles which uses fs.readdirsync
								//fs.readdir(d_path, function(err, these_item_keys) {
								//these_item_keys = fun.getVisibleFiles(d_path);
								//	for (var i=0; i<these_item_keys.length; i++) {
								//for (var i = 0; i < these_item_keys.length; i++) {
								//	var this_day = these_item_keys[i];
								//	//console.log(item_keys);
								//	item_keys.push(these_item_keys[i]);
								//}
								//console.log("LISTING files in " + d_path);
								if (fs.existsSync(d_path)) {
									item_keys = fun.getVisibleFiles(d_path);
									
									//for (var i=0; i<item_keys.length; i++) {
									//    console.log("   * " + item_keys[i]);
									//}
									if (!dat[section][selected_year][selected_month][selected_day]) dat[section][selected_year][selected_month][selected_day]={};
									//dat[section][selected_year][selected_month][selected_day]["item_keys"] = 
									
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
									//    console.log("    * "+items[key_i] (iterate object members)
									//}
								}
								else {
									if (req.session.selected_day) {
										//stale selection
										console.log("* cleared stale day selection ("+req.session.selected_day+") not in year "+selected_year+" month "+selected_month+" in "+section);
										delete req.session.selected_day;
									}
									else console.log("WARNING: stale selected_day stuck from another section or month doesn't exist in this month in this section");
								}
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
	if (req.session.runme) console.log("runme: "+req.session.runme);
	res.render('home', {user: req.user, section: section, runme: req.session.runme, mode: mode, selected_setting: req.query.selected_setting, prefill: req.session.prefill, missing_fields: req.session.missing_fields, prefill_mode: prefill_mode, selected_year:selected_year, selected_month: selected_month, selected_day: selected_day, section_report_edit_field: req.session.section_report_edit_field, selected_item_key: selected_item_key, sections: user_sections, modes_by_section: user_modes_by_section, user_selectable_modes: user_selectable_modes, years: years, months: months, days: days, objects: items, this_sheet_field_names: this_sheet_field_names, this_sheet_field_friendly_names: this_sheet_field_friendly_names});
	delete req.session.runme;
});

//displays our signup page
app.get('/login', function(req, res){
	res.render('login');
	delete req.session.runme;
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

app.post('/update-query', function(req, res){
	var sounds_path_then_slash = "sounds/";
	var update_match_count = 0;
	var update_saved_count = 0;
	if (req.hasOwnProperty("user") && req.user.hasOwnProperty("username")) {
		var section = req.body.section;
		if (section && req.body.selected_field) {
			if (user_has_section_permission(req.user.username, section, "modify")) {
				var table_path = data_dir_path + "/" + section;
				var y_path = table_path + "/" + req.body.selected_year;
				var m_path = y_path + "/" + req.body.selected_month;
				//if (fs.existsSync(m_path)) {
				//if (autofill_requires.hasOwnProperty(section) && autofill_requires[section].hasOwnProperty(req.body.selected_field)) {
				if (_settings && _settings.hasOwnProperty(section) && _settings[section].hasOwnProperty("autofill_requires") && _settings[section]["autofill_requires"].hasOwnProperty(req.body.selected_field)) {
					var msg = 'Changed value for '+req.body.selected_field+' to '+req.body.set_value;
					var ok = false;
					if (dat.hasOwnProperty(section)) {
						if (dat[section].hasOwnProperty(req.body.selected_year)) {
							if (dat[section][req.body.selected_year].hasOwnProperty(req.body.selected_month)) {
								var days_len=dat[section][req.body.selected_year][req.body.selected_month]["days"].length;
								if (days_len>0) {
									for (var day_i=0; day_i<days_len; day_i++) {
										var day_key = dat[section][req.body.selected_year][req.body.selected_month]["days"][day_i];
										var d_path = m_path + "/" + day_key;
										if (dat[section][req.body.selected_year][req.body.selected_month].hasOwnProperty(day_key)) {
											if (dat[section][req.body.selected_year][req.body.selected_month][day_key].hasOwnProperty("item_keys")) {
												var items_len=dat[section][req.body.selected_year][req.body.selected_month][day_key]["item_keys"].length;
												if (items_len>0) {
													for (item_i=0; item_i<items_len; item_i++) {
														var item_key = dat[section][req.body.selected_year][req.body.selected_month][day_key]["item_keys"][item_i];
														var item_path = d_path + "/" + item_key;
														if (fs.existsSync(item_path)) {
															if (dat[section][req.body.selected_year][req.body.selected_month][day_key].hasOwnProperty(item_key)) {
																var item = dat[section][req.body.selected_year][req.body.selected_month][day_key][item_key];
																var match_count=0;
																for (i=0; i<_settings[section]["autofill_requires"][req.body.selected_field].length; i++) {
																	var key = _settings[section]["autofill_requires"][req.body.selected_field][i];
																	var val = "";
																	if (item.hasOwnProperty(key)) {
																		var where_key = "where_"+key;
																		if (req.body[where_key] && fun.is_not_blank(req.body[where_key])
																			&& (req.body[where_key] == item[key]) ) {
																			match_count++;
																			//console.log("req.body[where_key]:"+req.body[where_key]+" is item[key]:"+item[key]);
																		}
																		//else console.log("req.body[where_key]:"+req.body[where_key]+" is not item[key]:"+item[key]);
																	}
																	//ret += "\n "+key+':<input name="where_'+key+'" id="'+key+'" value="'+val+'"/><br/>';
																}
																if (match_count>0 && match_count==_settings[section]["autofill_requires"][req.body.selected_field].length) {
																	dat[section][req.body.selected_year][req.body.selected_month][day_key][item_key][req.body.selected_field] = req.body.set_value;
																	dat[section][req.body.selected_year][req.body.selected_month][day_key][item_key]["mtime"] = moment().format('YYYY-MM-DD HH:mm:ss Z');
																	dat[section][req.body.selected_year][req.body.selected_month][day_key][item_key]["modified_by"] = req.user.username;
																	try {
																		yaml.writeSync(item_path, dat[section][req.body.selected_year][req.body.selected_month][day_key][item_key], "utf8");
																		var reason = " in update-query";
																		//yaml.write(item_path, dat[section][req.body.selected_year][req.body.selected_month][day_key][item_key], 'utf8', function (err) {
																		//	if (err) {
																		//		return console.log("[ * ] saving entry"+reason+"..."+err);
																		//	}
																		//	//else console.log("[ * ] saving entry"+reason+"...OK");
																		//});
																		update_saved_count++;
																	}
																	catch (err) {
																		req.session.error = "\nCould not finish writing "+item_path+": "+err;
																	}
																	update_match_count++;
																}
																ok=true; //verified cache is ok either way
															}
															else console.log("[ ] Cache missed for item_key "+item_key);
														}
														else {
															msg="Failed to modify since can't find file "+item_path;
															console.log(msg);
															req.session.error=msg;
														}
													}
												}
												else console.log("[ ] Cache missed -- 0 item_keys for "+day_key);
											}
											else console.log("[ ] Cache missed for item_keys for "+day_key);
										}
										else console.log("[ ] Cache missed for day "+day_key);
									}//end of outermost for loop
									req.session.success = msg + " for " + update_saved_count + " of " + update_match_count + " matching ";
								}
								else console.log("[ ] Cached missed -- 0 days in month "+req.body.selected_month);
							}
							else console.log("[ ] Cache missed for month "+req.body.selected_month);
						}
						else console.log("[ ] Cache missed for year "+req.body.selected_year);
					}
					else {
						console.log("[ ] Cache missed for section "+section);
						console.log("  only has:");
						for (var key in dat) {
							console.log("    "+key);
						}
					}
					if (!ok) req.session.error = "Cache failure in update query so skipped saving value for "+req.body.selected_field+"!";
				}
				else {
					req.session.error = "Section "+section+" does not specify which information is needed to uniquely identify person (_settings["+section+"]['autofill_requires'] does not have a field list for "+req.body.selected_field+")";
				}
			}
			else {
				req.session.error = "not authorized to modify data for '" + section + "'";
				if (config.audio_enable) req.session.runme = ("var audio = new Audio('"+sounds_path_then_slash+"security-warning.wav'); audio.play();"); //new Handlebars.SafeString
				delete req.session.prefill.pin;
			}
		}
		else {
			req.session.error = "section and selected_field are required but are missing from form";
			if (config.audio_enable) req.session.runme = ("var audio = new Audio('"+sounds_path_then_slash+"security-warning.wav'); audio.play();"); //new Handlebars.SafeString
			delete req.session.prefill.pin;
		}
	}
	
	if (fun.array_contains(transient_modes, req.session.mode)) req.session.mode = transient_modes_return[req.session.mode];
	res.redirect(config.proxy_prefix_then_slash);
}); //end update-query

app.post('/change-microevent-field', function(req, res){
	var sounds_path_then_slash = "sounds/";
	var bookmark_enable = false;
	if (req.hasOwnProperty("user") && req.user.hasOwnProperty("username")) {
		var section = req.body.section;
		if (user_has_section_permission(req.user.username, section, "modify")) {
			var table_path = data_dir_path + "/" + section;
			var y_path = table_path + "/" + req.body.selected_year;
			var m_path = y_path + "/" + req.body.selected_month;
			var d_path = m_path + "/" + req.body.selected_day;
			//NOTE: only modify req.body.selected_field
			var item_path = d_path + "/" + req.body.selected_key;
			if (fun.is_not_blank(req.body.selected_key) && fs.existsSync(item_path)) {
				bookmark_enable = true;
				var msg = 'Changed value for '+req.body.selected_field+' to '+req.body.set_value;
				var ok = false;
				if (dat.hasOwnProperty(section)) {
					if (dat[section].hasOwnProperty(req.body.selected_year)) {
						if (dat[section][req.body.selected_year].hasOwnProperty(req.body.selected_month)) {
							if (dat[section][req.body.selected_year][req.body.selected_month].hasOwnProperty(req.body.selected_day)) {
								if (dat[section][req.body.selected_year][req.body.selected_month][req.body.selected_day].hasOwnProperty(req.body.selected_key)) {
									
									dat[section][req.body.selected_year][req.body.selected_month][req.body.selected_day][req.body.selected_key][req.body.selected_field] = req.body.set_value;
									dat[section][req.body.selected_year][req.body.selected_month][req.body.selected_day][req.body.selected_key]["mtime"] = moment().format('YYYY-MM-DD HH:mm:ss Z');
									dat[section][req.body.selected_year][req.body.selected_month][req.body.selected_day][req.body.selected_key]["modified_by"] = req.user.username;
									autofill(section, dat[section][req.body.selected_year][req.body.selected_month][req.body.selected_day][req.body.selected_key], false);
									try {
										yaml.writeSync(item_path, dat[section][req.body.selected_year][req.body.selected_month][req.body.selected_day][req.body.selected_key], "utf8");
										//var reason = " in change-microevent-field";
										//yaml.write(item_path, dat[section][req.body.selected_year][req.body.selected_month][req.body.selected_day][req.body.selected_key], 'utf8', function (err) {
										//	if (err) {
										//		return console.log("[ * ] saving entry"+reason+"..."+err);
										//	}
										//	//else console.log("[ * ] saving entry"+reason+"...OK");
										//});
										req.session.success = msg;
									}
									catch (err) {
										req.session.error = "\nCould not finish writing "+item_path+": "+err;
									}
									
									ok=true; //verified cache is ok either way
								}
								else console.log("Cache missed for key "+req.body.selected_key);
							}
							else console.log("Cache missed for day "+req.body.selected_day);
						}
						else console.log("Cache missed for month "+req.body.selected_month);
					}
					else console.log("Cache missed for year "+req.body.selected_year);
				}
				else {
					console.log("Cache missed for section "+section);
					console.log("  only has:");
					for (var key in dat) {
						console.log("    "+key);
					}
				}
				if (!ok) req.session.error = "Cache failure in change-microevent-field so skipped saving value for "+req.body.selected_field+"!";
			}
			else {
				req.session.error = 'Skipping change to field since '+item_path+' does not exist.';
			}
		}
		else {
			req.session.error = "not authorized to modify data for '" + section + "'";
			if (config.audio_enable) req.session.runme = ("var audio = new Audio('"+sounds_path_then_slash+"security-warning.wav'); audio.play();"); //new Handlebars.SafeString
			delete req.session.prefill.pin;
		}
	}
	
	if (fun.array_contains(transient_modes, req.session.mode)) req.session.mode = transient_modes_return[req.session.mode];
	res.redirect(config.proxy_prefix_then_slash+((bookmark_enable)?("#"+req.body.selected_key):""));
});  // change-microevent-field

app.post('/split-entry', function(req, res){
	var sounds_path_then_slash = "sounds/";
	var bookmark_enable = false;
	var indent="  ";
	if (req.hasOwnProperty("user") && req.user.hasOwnProperty("username")) {
		var section = req.body.section;
		if (user_has_section_permission(req.user.username, section, "modify")) {
			var table_path = data_dir_path + "/" + section;
			var y_path = table_path + "/" + req.body.selected_year;
			var m_path = y_path + "/" + req.body.selected_month;
			var d_path = m_path + "/" + req.body.selected_day;
			//NOTE: only modify req.body.selected_field
			var item_path = d_path + "/" + req.body.selected_key;
			if (fun.is_not_blank(req.body.selected_key) && fs.existsSync(item_path)) {
				bookmark_enable = true;
				var msg = 'Changed value for '+req.body.selected_field+' to '+req.body.set_value;
				var ok = false;
				if (dat.hasOwnProperty(section)) {
					if (dat[section].hasOwnProperty(req.body.selected_year)) {
						if (dat[section][req.body.selected_year].hasOwnProperty(req.body.selected_month)) {
							if (dat[section][req.body.selected_year][req.body.selected_month].hasOwnProperty(req.body.selected_day)) {
								if (dat[section][req.body.selected_year][req.body.selected_month][req.body.selected_day].hasOwnProperty(req.body.selected_key)) {
									var hdv_item_splitter_name = null;
									if (has_setting(section+".list_implies_multiple_entries")) hdv_item_splitter_name = peek_setting(section+".list_implies_multiple_entries");
									if (hdv_item_splitter_name!==null) {
										var original_item = dat[section][req.body.selected_year][req.body.selected_month][req.body.selected_day][req.body.selected_key];
										var subvalues = fun.get_human_delimited_values(original_item[hdv_item_splitter_name]);
										
										var hdv_paired_name = null
										if (has_setting(section+".list_implies_multiple_entries_paired_with")) hdv_paired_name = peek_setting(section+".list_implies_multiple_entries_paired_with");
										var matching_pairs = null;
										if (hdv_paired_name!==null) {
											matching_pairs = fun.get_human_delimited_values(original_item[hdv_paired_name]);
										}
										console.log("");
										console.log("[ | ] Splitting...");
										
										console.log(indent+"subvalues: "+JSON.stringify(subvalues));
										if ( hdv_paired_name===null || (matching_pairs!==null&&matching_pairs.length===subvalues.length) ) {
											var error = "";
											var notice = "";
											if (req.body.expected_count==subvalues.length) {
												console.log(indent+"expected_count: "+req.body.expected_count);
												var new_record_ids = [];
												var new_record_paths = [];
												var original_field_value = original_item[req.body.selected_field];
												console.log(indent+"original_field_value: "+original_field_value);
												var split_time = moment().format('YYYY-MM-DD HH:mm:ss Z');
												var date_array = [req.body.selected_year, req.body.selected_month, req.body.selected_day];
												var tried_output_count = 0;
												//for (i=0,len=subvalues.length; i<len; i++) {
												for (var i=0,len=subvalues.length; i<len; i++) {
													var new_item = JSON.parse(JSON.stringify(original_item));
													console.log(indent+" subvalue "+i+" of "+len+": "+subvalues[i]+"...");
													new_item["split_source_field"] = req.body.selected_field;
													new_item["split_time"] = split_time;
													new_item["split_by"] = req.user.username;
													new_item["split_source"] = "dated_folder_record " + section + "/" + req.body.selected_year + "/" + req.body.selected_month + "/" + req.body.selected_day + "/" + req.body.selected_key;
													new_item[req.body.selected_field] = subvalues[i];
													if (matching_pairs) {
														new_item[hdv_paired_name] = matching_pairs[i];
														console.log(indent+"  set paired field "+hdv_paired_name+" to "+matching_pairs[i]);
													}
													//autofill(section, new_item, false);
													var new_key = original_item.key;
													if (original_item.key) {
														var dot_i = original_item.key.lastIndexOf(".");
														if (dot_i>=0) {
															new_key = original_item.key.substring(0, dot_i) + "-" + (i+1) + original_item.key.substring(dot_i);
														}
														else new_key = original_item.key + "-" + (i+1);
													}
													else new_key=null;  // results in a key being generated based on the current time
													//fields were already validated since using an existing entry
													//fields were already autofilled above
													//                             req_else_null, section, date_array_else_null, record, as_username,     write_mode, custom_file_name_else_null, autofill_enable
													var results = write_record_without_validation(req, section, date_array,    new_item, req.user.username, "create", new_key,                    false); 
													if (results.out_path && results.out_name) { //results.out_path is only set AFTER file is written so always check that
														new_item.key = results.out_name;
														dat[section][req.body.selected_year][req.body.selected_month][req.body.selected_day][results.out_name] = new_item;
														if (!fun.array_contains(dat[section][req.body.selected_year][req.body.selected_month][req.body.selected_day]["item_keys"],results.out_name))
															dat[section][req.body.selected_year][req.body.selected_month][req.body.selected_day]["item_keys"].push(results.out_name);
													}
													if (results.notice) notice += "\n"+results.notice+" "; //+"<!--" + out_path + "-->.";
													if (results.out_path) {
														new_record_paths.push(results.out_path);
														new_record_ids.push("dated_folder_record " + section + "/" + req.body.selected_year + "/" + req.body.selected_month + "/" + req.body.selected_day + "/" + results.out_name);
													}
													if (fun.is_not_blank(results.error)) error += "\n"+results.error+" ";
													ok=true; //verified cache is ok either way
													tried_output_count += 1;
													console.log(indent+"  done splitting value at index "+i);
												}//end for subvalues
												
												if (subvalues.length<1) {
													var tmp = "ERROR: can't split subvalues from hdv_item_splitter_name: "+original_item[hdv_item_splitter_name];
													error += tmp;
													console.log(indent+tmp);
												}
												else if (tried_output_count<req.body.expected_count) {
													var tmp = "ERROR: did't split "+req.body.expected_count+" expected subvalues--only tried "+tried_output_count+" of "+subvalues.length+" split";
													error += tmp;
													console.log(indent+tmp);
												}
												
												if (fun.is_blank(error)) {
													original_item["split_destination_field"] = req.body.selected_field;
													
													original_item["split_time"] = split_time;
													//original_item["modified_by"] = req.user.username;
													original_item["split_by"] = req.user.username;
													original_item["split_destinations"] = new_record_ids;
													original_item["active"] = false; //no longer use the record, it has been split
													original_item[req.body.selected_field] = original_field_value;
													console.log(indent+"saving old record as deactivated: "+req.body.selected_key);
													var results = write_record_without_validation(req, section, date_array, original_item, req.user.username, "modify", req.body.selected_key, false);
													//dat[section][req.body.selected_year][req.body.selected_month][req.body.selected_day][req.body.selected_key] = original_item;
													if (fun.is_blank(results.error)) {
														if (config.audio_enable) req.session.runme = ("var audio = new Audio('"+sounds_path_then_slash+"success.wav'); audio.play();"); //new Handlebars.SafeString
													}
													else {
														error += "\n"+results.error+" ";
													}
													if (fun.is_not_blank(results.notice)) notice += "\n" + results.notice + " ";
												}
												else {
													console.log(indent+"rolling back changes...");
													for (x=0; x<new_record_paths.length; x++) {
														console.log(indent+"* Deleting "+new_record_paths[x]+"...");
														fs.unlink(new_record_paths[x], function (err) {
															 //NOTE: new_record_paths[x] is not defined in this scope
															if (err) console.log(indent+"  * ERROR while deleting a stay split result: "+err);
															else console.log(indent+"  * deleted a stray split result");
														});
													}
												}
												if (fun.is_not_blank(notice)) req.session.notice = notice;
												if (fun.is_not_blank(error)) req.session.error = error;
												else notice += "\n"+msg+" ";
											}
											else req.session.error = "Cannot split since expected "+req.body.expected_count+" entries but detected "+subvalues.length;
										}
										else req.session.error = "Cannot split since expected same count ("+subvalues.length+") from "+hdv_paired_name+" but got "+JSON.stringify(matching_pairs);
									}
									else req.session.error = "Cannot split since missing setting: "+section+".list_implies_multiple_entries";
								}
								else console.log("Cache missed for key "+req.body.selected_key);
							}
							else console.log("Cache missed for day "+req.body.selected_day);
						}
						else console.log("Cache missed for month "+req.body.selected_month);
					}
					else console.log("Cache missed for year "+req.body.selected_year);
				}
				else {
					console.log("Cache missed for section "+section);
					console.log("  only has:");
					for (var key in dat) {
						console.log("    "+key);
					}
				}
				//if (!ok) req.session.error = "Cache failure in split-entry so skipped saving value for "+req.body.selected_field+"!";
			}
			else {
				req.session.error = 'Skipping change to field since '+item_path+' does not exist.';
			}
		}
		else {
			req.session.error = "not authorized to modify data for '" + section + "'";
			if (config.audio_enable) req.session.runme = ("var audio = new Audio('"+sounds_path_then_slash+"security-warning.wav'); audio.play();"); //new Handlebars.SafeString
			delete req.session.prefill.pin;
		}
	}
	
	if (fun.array_contains(transient_modes, req.session.mode)) req.session.mode = transient_modes_return[req.session.mode];
	res.redirect(config.proxy_prefix_then_slash+((bookmark_enable)?("#"+req.body.selected_key):""));
});

app.get('/admin', function(req, res){
	var sounds_path_then_slash = "sounds/";
	if (_groups.hasOwnProperty("admin") && fun.array_contains(_groups["admin"], req.user.username)) {
		if (req.body.mode="reload-settings") {
			if (fs.existsSync(settings_path)) {
				_settings = yaml.readSync(settings_path, "utf8");
				req.session.success = "Successfully reloaded "+settings_path+".";
				console.log("[ ^. ] reloaded settings");
			}
			else {
				_settings = JSON.parse(JSON.stringify(settings_default));
				console.log("[ ^. ] reloaded settings from defaults");
				//yaml.writeSync(settings_path, _settings, "utf8");
				yaml.write(settings_path, _settings, "utf8", function (err) {
					if (err) {
						console.log("[ . ] Error while saving settings in /admin: " + err);
					}
					//else console.log("[ . ] saved settings");
				});
				req.session.info = "WARNING: "+settings_path+" could not be read in /admin, so loaded then saved defaults there instead.";
				//console.log("* saved settings");
			}
		}
		else req.session.error = "Unknown admin request "+req.body.mode;
	}
	else {
		req.session.error = "You are not in the admin group";
		if (config.audio_enable) req.session.runme = ("var audio = new Audio('"+sounds_path_then_slash+"security-warning.wav'); audio.play();"); //new Handlebars.SafeString
		delete req.session.prefill.pin;
	}
	res.redirect(config.proxy_prefix_then_slash);
	//res.write("<html><body>admin did it</body></html>")
});

app.post('/poke-settings', function(req, res) {
	var sounds_path_then_slash = "sounds/";
	if (req.hasOwnProperty("user") && req.user.hasOwnProperty("username")) {
		if (user_has_section_permission(req.user.username, "admin", "poke-settings")) {
			req.session.success = "poking value "+req.body.selected_setting+"="+peek_setting(req.body.selected_setting)+" to "+req.body.selected_setting_value;
			poke_setting(req.body.selected_setting, req.body.selected_setting_value);
		}
		else {
			req.session.error = "not authorized to modify data for '" + req.body.section + "'";
			if (config.audio_enable) req.session.runme = ("var audio = new Audio('"+sounds_path_then_slash+"security-warning.wav'); audio.play();"); //new Handlebars.SafeString
			delete req.session.prefill.pin;
		}
	}
		
	if (fun.array_contains(transient_modes, req.session.mode)) req.session.mode = transient_modes_return[req.session.mode];
	res.redirect(config.proxy_prefix_then_slash);
});

app.get('/change-selection', function (req, res) {
	var sounds_path_then_slash = "sounds/";
	var section = req.query.section;
	if (req.hasOwnProperty("user") && req.user.hasOwnProperty("username")) {
		if (user_has_section_permission(req.user.username, section, "read")) {
			//if (req.query.selected_field) {
			//	req.session.selected_field = req.query.selected_field;
			//	console.log("Changed req.session.selected_field to "+req.session.selected_field); 
			//}
			if (req.query.change_section_report_edit_field) {
				var selected_field = null;
				if (section_sheet_fields_friendly_names.hasOwnProperty(section)) {
					for (var key in section_sheet_fields_friendly_names[section]) {
						if (section_sheet_fields_friendly_names[section].hasOwnProperty(key)) {
							var val = section_sheet_fields_friendly_names[section][key];
							if (key.toLowerCase()==req.query.change_section_report_edit_field.toLowerCase()) {
								selected_field = key;
								break;
							}
							else if (val.toLowerCase()==req.query.change_section_report_edit_field.toLowerCase()) {
								selected_field = key;
								break;
							}
						}
					}
				}
				if (selected_field===null && section_sheet_fields.hasOwnProperty(section)) {
					for (var i=0; i<section_sheet_fields[section].length; i++) {
						var val = section_sheet_fields[section][i];
						if (val.toLowerCase()==req.query.change_section_report_edit_field) {
							selected_field = val;
						}
					}
				}
				if (selected_field!=null) {
					if (!req.session.section_report_edit_field.hasOwnProperty(section)) req.session.section_report_edit_field[section] = {};
					if (!req.session.section_report_edit_field[section].hasOwnProperty(req.query.mode)) req.session.section_report_edit_field[section][req.query.mode] = {};
					req.session.section_report_edit_field[section][req.query.mode] = selected_field; //.toFixed(2)
					//req.session.success = "Changed selected field for "+req.query.mode+" mode to "+req.session.section_report_edit_field[section][req.query.mode];
				}
				else req.session.error = "Invalid field specified (no matching literal data field on sheet): "+req.query.change_section_report_edit_field;
			}
			else {
				req.session.error = "Invalid selection change (new field name was not specified).";
			}
		}
		else {
			req.session.error = "not authorized to select in '" + section + "'";
			if (config.audio_enable) req.session.runme = ("var audio = new Audio('"+sounds_path_then_slash+"security-warning.wav'); audio.play();"); //new Handlebars.SafeString
			delete req.session.prefill.pin;
		}
	}
	else console.log("ERROR in change-selection: user not logged in");
		
	if (fun.array_contains(transient_modes, req.session.mode)) req.session.mode = transient_modes_return[req.session.mode];
	res.redirect(config.proxy_prefix_then_slash);
});

app.post('/change-section-settings', function(req, res) {
	var sounds_path_then_slash = "sounds/";
	if (req.hasOwnProperty("user") && req.user.hasOwnProperty("username")) {
		if (user_has_section_permission(req.user.username, req.body.section, "change-section-settings")) {
			if (has_setting(req.body.section+"."+req.body.selected_setting)) {
				if (req.body.selected_setting=="local_start_time") {
					var tmp = good_time_string(req.body.selected_setting_value);
					if (tmp) {
						poke_setting(req.body.section+"."+req.body.selected_setting, tmp);
					}
					else req.session.error = "Invalid time format";
				}
				else if (req.body.selected_setting=="local_end_time") {
					var tmp = good_time_string(req.body.selected_setting_value);
					if (tmp) {
						poke_setting(req.body.section+"."+req.body.selected_setting, tmp);
					}
					else req.session.error = "Invalid time format";
				}
				else {
					poke_setting(req.body.section+"."+req.body.selected_setting, req.body.selected_setting_value);
					req.session.success = "Changed "+req.body.section+" "+req.body.selected_setting+" to "+peek_setting(req.body.section+"."+req.body.selected_setting);
				}
			}
			else {
				req.session.error = "no setting "+req.body.selected_setting+" exists in "+req.body.section+" section";
			}
			/*
			if (req.body.change_section_rate) {
				if (!_settings) {
					_settings = {};
					console.log("WARNING: In change-section-settings, null _settings (now set to empty object)")
				}
				if (!_settings.hasOwnProperty(req.body.section)) _settings[req.body.section] = {};
				_settings[req.body.section]["extended_hours_hourly_price"] = parseFloat(req.body.change_section_rate); //.toFixed(2)
				//section_rates[req.body.section] = parseFloat(req.body.change_section_rate); //.toFixed(2)
				//yaml.writeSync(settings_path, _settings, "utf8");
				yaml.write(settings_path, _settings, "utf8", function (err) {
					if (err) {
						return console.log("[ . ] Error while saving settings in change-section-settings: " + err);
					}
					//console.log("[ . ] saved settings");
				});
				req.session.success = "Changed rate to "+_settings[req.body.section]["extended_hours_hourly_price"];//section_rates[req.body.section];
			}
			else if (req.body.change_start_time) {
				var tmp = good_time_string(req.body.change_start_time);
				if (tmp) {
					if (!_settings.hasOwnProperty(req.body.section)) _settings[req.body.section] = {};
					poke_setting(req.body.section+".local_start_time", tmp);//_settings[req.body.section]["local_start_time"] = tmp;
					startTime = moment(_settings[req.body.section]["local_start_time"], "HH:mm:ss");
					//yaml.writeSync(settings_path, _settings, "utf8");
				}
				else req.session.error = "Invalid time format";
			}
			else if (req.body.change_end_time) {
				var tmp = good_time_string(req.body.change_end_time);
				if (tmp) {
					if (!_settings.hasOwnProperty(req.body.section)) _settings[req.body.section] = {};
					_settings[req.body.section]["local_end_time"] = tmp;
					startTime = moment(_settings[req.body.section]["local_end_time"], "HH:mm:ss");
					//yaml.writeSync(settings_path, _settings, "utf8");
					yaml.write(settings_path, _settings, "utf8", function (err) {
						if (err) {
							return console.log("[ . ] Error while saving settings: " + err);
						}
						//console.log("[ . ] saved settings");
					});
				}
				else req.session.error = "Invalid time format";
			}
			else {
				req.session.error = "Invalid setting change (setting was not specified).";
			}
			*/
		}
		else {
			req.session.error = "not authorized to modify data for '" + req.body.section + "'";
			if (config.audio_enable) req.session.runme = ("var audio = new Audio('"+sounds_path_then_slash+"security-warning.wav'); audio.play();"); //new Handlebars.SafeString
			delete req.session.prefill.pin;
		}
	}
		
	if (fun.array_contains(transient_modes, req.session.mode)) req.session.mode = transient_modes_return[req.session.mode];
	res.redirect(config.proxy_prefix_then_slash);
});

app.post('/student-microevent', function(req, res){
	//req is request, res is response
	var sounds_path_then_slash = "sounds/";
	//sounds_path_then_slash = config.proxy_prefix_then_slash+"sounds/";
	//sounds_path_then_slash = sounds_path_then_slash.substring(1); //remove leading slash
	
	if (req.hasOwnProperty("user") && req.user.hasOwnProperty("username")) {
		//console.log("* NOTE: student-microevent by " + req.user.username);
		//if using qs, student sign in/out form subscript fields can be created in html template, then accessed here via dot notation: family_id first_name last_name grade (time is calculated here)
		//var prefill_stated_time;
		if (!req.session.hasOwnProperty("prefill")) req.session.prefill = {};
		if (fun.is_not_blank(req.body.stated_time)) req.session.prefill.stated_time = req.body.stated_time.trim();
		else {
			delete req.session.prefill.stated_time;
		}
		//else req.session.prefill.stated_time = moment().format("HH:mm:ss");
		
		if (fun.is_not_blank(req.body.stated_date)) req.session.prefill.stated_date = req.body.stated_date.trim();
		else {
			delete req.session.prefill.stated_date;
		}
		//else req.session.prefill.stated_date = moment().format("YYYY-MM-DD");
		
		//if (("family_id" in req.body) ) req.session.prefill.family_id = req.body.family_id.trim();
		//if ("first_name" in req.body) req.session.prefill.first_name = req.body.first_name.trim();
		//if ("last_name" in req.body) req.session.prefill.last_name = req.body.last_name.trim();
		//if ("grade_level" in req.body) req.session.prefill.grade_level = req.body.grade_level.trim();
		//if ("chaperone" in req.body) req.session.prefill.chaperone = req.body.chaperone.trim();
		//if ("reason" in req.body) req.session.prefill.reason = req.body.reason.trim();
		var record = {};
		var custom_error = null;
		var missing_msg = "";
		req.session.missing_fields = [];
		
		req.session.section = req.body.section;
		var section = req.body.section;
		req.session.mode = req.body.mode;
		
		if (section_form_fields.hasOwnProperty(section)) {
			for (var index in section_form_fields[section]) {
				if (section_form_fields[section].hasOwnProperty(index)) {
					var key = section_form_fields[section][index];
					if (key in req.body) {
						if (req.body[key]) {
							if (req.body[key].substring(0,8)!="prefill_") {
								req.session.prefill[key] = req.body[key];
								if (!never_save_fields.includes(key)) {
									if (req.body[key]) record[key] = req.body[key].trim();
									else record[key] = req.body[key]; //blank apparently, but may be "0"
								}
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
			custom_error = "unknown section '" + section + "'";
		}
		if (section_required_fields.hasOwnProperty(section)) {
			for (var index in section_required_fields[section]) {
				if (section_required_fields[section].hasOwnProperty(index)) {
					var key = section_required_fields[section][index];
					if (req.session.prefill.hasOwnProperty(key)) {
						if (fun.is_blank(req.session.prefill[key])) delete req.session.prefill[key];
					}
					if (!req.session.prefill.hasOwnProperty(key)) {
						custom_error = "MISSING: ";
						if (missing_msg!="") missing_msg += ",";
						key_friendly_name = key;
						if (fields_friendly_names.key) key_friendly_name = fields_friendly_names.key;
						missing_msg += " " + key;
						req.session.missing_fields.push(key);
					}
					//else {
					//    console.log("_ prefill."+key + " is in session with value "+req.session.prefill[key]);
					//}
				}
			}
		}
		else {
			console.log("WARNING: no required fields are specified for section '" + section + "'.");
			custom_error = "unknown section '" + section + "'";
		}
		
		//console.log(req.body.family_id);
		if (!custom_error) {
			
			//already done above?
			//for (var indexer in req.session.prefill) {
			//	if (req.session.prefill.hasOwnProperty(indexer)) {
			//		record[indexer] = req.session.prefill[indexer];
			//	}
			//}
			
			//if already done above, why was this code here before the loop was (NOTE: commented code updated for non-global prefill data as writing this comment)?
			//if (req.session.prefill.hasOwnProperty("name")) record.name=req.session.prefill.name;
			//if (req.session.prefill.hasOwnProperty("first_name")) record.first_name=req.session.prefill.first_name;
			//if (req.session.prefill.hasOwnProperty("last_name")) record.last_name=req.session.prefill.last_name;
			//if (req.session.prefill.hasOwnProperty("chaperone")) record.chaperone=req.session.prefill.chaperone;
			//record.grade_level=req.session.prefill.grade_level;
			//if (req.session.prefill.hasOwnProperty("family_id")) record.family_id=req.session.prefill.family_id;
			var stated_date_enable = false;
			if (req.session.prefill.hasOwnProperty("stated_date")) {
				if (req.session.prefill.stated_date.length==10) {
					if (req.session.prefill.stated_date.substring(2,3)=="/"
						&& req.session.prefill.stated_date.substring(5,6)=="/"
						&& fun.only_contains_any_char(req.session.prefill.stated_date.substring(0,2), "0123456789")
						&& fun.only_contains_any_char(req.session.prefill.stated_date.substring(3,5), "0123456789")
						&& fun.only_contains_any_char(req.session.prefill.stated_date.substring(6), "0123456789")
						) {
						//convert MM/DD/YYYY to YYYY-MM-DD:
						original_stated_date = req.session.prefill.stated_date;
						req.session.prefill.stated_date = req.session.prefill.stated_date.substring(6) + "-" + req.session.prefill.stated_date.substring(0,2) + "-" + req.session.prefill.stated_date.substring(3,5);
						stated_date_enable = true;
						console.log("  * NOTE: converted date " + original_stated_date + " to " + req.session.prefill.stated_date)
					}
					else if (req.session.prefill.stated_date.substring(4,5)=="-"
						&& req.session.prefill.stated_date.substring(7,8)=="-"
						&& fun.only_contains_any_char(req.session.prefill.stated_date.substring(0,4), "0123456789")
						&& fun.only_contains_any_char(req.session.prefill.stated_date.substring(5,7), "0123456789")
						&& fun.only_contains_any_char(req.session.prefill.stated_date.substring(8), "0123456789")
						) {
						stated_date_enable = true;
					}
				}
				if (!stated_date_enable) {
					custom_error = "custom date " + req.session.prefill.stated_date + " must be in YYYY-MM-DD or MM/DD/YYYY format";
					//var details = " ... ";
					//if (!fun.only_contains_any_char(req.session.prefill.stated_date.substring(6), "0123456789")) details += "non-number in last 4 digits; ";
					//if (!fun.only_contains_any_char(req.session.prefill.stated_date.substring(0,4), "0123456789")) details += "non-number in first 4 digits; ";
					//custom_error += details;
				}
				else {
					if (user_has_pinless_time(section, req.user.username)) {
						console.log("  * NOTE: PIN skipped for commute custom date: "+req.user.username+" (this is ok since user has pinless custom time for this section)");
					}
					else if (user_has_section_permission(req.user.username, section, "modify")) {
						console.log("  * NOTE: PIN skipped for commute custom date: "+req.user.username+" (this is ok since user has modify priv for this section)");
					}
					else if (req.body.pin && config.office_pin && (req.body.pin==config.office_pin)) {
						//do nothing since stated_date_enable already true
					}
					else {
						custom_error="INCORRECT PIN: To use custom time, office must enter the correct pin (otherwise leave time blank for current).";
						if (!config.office_pin) custom_error = custom_error + "; website administrator has not yet set office_pin in config.json";
						stated_date_enable = false;
					}
					if (stated_date_enable) record.stated_date=req.session.prefill.stated_date;
				}
			}
			//var uac_error = null;
			if (req.session.prefill.stated_time !== undefined) {
				if (req.session.prefill.stated_time.toLowerCase().match("am")
					|| req.session.prefill.stated_time.toLowerCase().match("pm") ) {
					if (  (section=="commute") &&  ( (!req.body.pin) || (req.body.pin!=config.office_pin))  ) {
						if (user_has_section_permission(req.user.username, "commute", "modify")) {
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
					//missing_msg += " " + "AM or PM is required for custom time";
				}
			}
			if (!custom_error) {
				//TODO: Check for "modify" priv instead if key is specified -- in that case also keep existing fields and overlay the new data (keep created_by fields especially, and add "modified_by*" fields)
				//NOTE: if key is specified, then check if has modify permission instead, and edit same file instead.
				if (user_has_section_permission(req.user.username, section, "create")) {
					var results = write_record_without_validation(req, section, null, record, req.user.username, "create", null, true); //already validated above
					if (results.notice) req.session.notice = results.notice; //+"<!--" + out_path + "-->.";
					if (fun.is_blank(results.error)) {
						if (config.audio_enable) req.session.runme = ("var audio = new Audio('"+sounds_path_then_slash+"success.wav'); audio.play();"); //new Handlebars.SafeString
						//for (var indexer in req.session.prefill) {
						//	if (req.session.prefill.hasOwnProperty(indexer)) {
						//		console.log("- deleting "+indexer);
						//		delete req.session.prefill.indexer;
						//	}
						//	else console.log("- oops not deleting "+indexer);
						//}
						req.session.prefill = {};
						//console.log("  new values:")
						//for (var indexer in req.session.prefill) {
						//	console.log("    prefill."+indexer+":"+req.session.prefill[indexer]);
						//}
						//delete req.session.prefill.time;
						//delete req.session.prefill.family_id;
						//delete req.session.prefill.first_name;
						//delete req.session.prefill.last_name;
						//delete req.session.prefill.grade_level;
						//delete req.session.prefill.chaperone;
						//delete req.session.prefill.reason;
						//delete req.session.prefill.time;
						//delete req.session.prefill.ctime;
						//delete req.session.prefill.stated_time;
						//delete req.session.prefill.stated_date;
						//delete req.session.runme;
					}
					else {
						req.session.error = results.error;
					}
				}
				else {
					req.session.error = "not authorized to modify data for '" + section + "'";
					if (config.audio_enable) req.session.runme = ("var audio = new Audio('"+sounds_path_then_slash+"security-warning.wav'); audio.play();"); //new Handlebars.SafeString
					delete req.session.prefill.pin;
					//delete req.session.prefill.heading;
				}
			}
			else {//formatting error
				
				req.session.error = custom_error;//+ "<script>var Speech = require('speak-tts'); Speech.init({'onVoicesLoaded': (data) => {console.log('voices', data.voices)},'lang': 'en-US','volume': 0.5,'rate': 0.8,'pitch': 0.8});"+'Speech.speak({text: "'+custom_error+'" })</script>';
				if (config.audio_enable) req.session.runme = ("var audio = new Audio('"+sounds_path_then_slash+"missing-information.wav'); audio.play();"); //new Handlebars.SafeString
				delete req.session.prefill.pin;
				//delete req.session.prefill.heading;
			}
		}
		else {
			for (var index in req.body) {
				if ( fun.array_contains(section_form_fields[section], index) ) {
					req.session.prefill[index] = req.body[index];
				}
			}
			delete req.session.prefill.pin;
			//delete req.session.prefill.heading;
			//req.session.error = new Handlebars.SafeString(custom_error + missing_msg + "<script>var audio = new Audio('missing-information.wav'); audio.play();</script>");
			req.session.error = custom_error + missing_msg;
			if (config.audio_enable) req.session.runme = ("var audio = new Audio('"+sounds_path_then_slash+"missing-information.wav'); audio.play();"); //new Handlebars.SafeString
		}
	}
	else {
		for (var member in req.session.prefill) {
			delete req.session.prefill.member;
		}
		req.session.error = "The server was reset so you must log in again. Sorry for the inconvenience.";
		delete req.session.runme;
	}
	if (fun.array_contains(transient_modes, req.session.mode)) req.session.mode = transient_modes_return[req.session.mode];
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
	delete req.session.runme;
	req.session.destroy(function (err) {
		res.redirect(config.proxy_prefix_then_slash.trim()); //Inside a callback… bulletproof!
	});
	//NOTE: following line won't work since now session is undefined
	//req.session.notice = "You have successfully been logged out " + name + "!";
});

//===============PORT=================
var port = process.env.PORT || 8080; //select your port or let it pull from your .env file
app.listen(port);
console.log("listening on " + port + "!");
