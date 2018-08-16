//index.js/
try {
    var express_path = require.resolve("express");
} catch(e) {
    console.error("express is not found");
    console.error("make sure npm is installed");
    console.error("then run `npm install` from the project directory")
    console.error("to install required packages")
    process.exit(e.code);
}
var express = require('express'),
	exphbs = require('express-handlebars'),
	logger = require('morgan'),
	moment = require('moment-timezone'),
	cookieParser = require('cookie-parser'),
	bodyParser = require('body-parser'),
	methodOverride = require('method-override'),
	session = require('express-session'),
	passport = require('passport'),
	LocalStrategy = require('passport-local'), // TODO: ? add .Strategy to return of require as per <http://www.passportjs.org/docs/>
	yaml = require("node-yaml"),
	util = require('util'),
	fs = require('fs');
//    TwitterStrategy = require('passport-twitter'),
//    GoogleStrategy = require('passport-google'),
//    FacebookStrategy = require('passport-facebook');
var path = require("path");
var Handlebars = require('handlebars');
//var dynamic_a_name = "dynamic_bookmark";

var autofill_cache_format = "yml";  // yml or json
var risky_write_missing_tz_info_using_current_enable = true;  // in case of timezone info missing from record (such as in records written by early pre-0.1.0 versions), fill in next time record is modified (ASSUMES timezone info hasn't changed since original write)

//region only show these once (missing optional settings)
var show_no_requirer_for_section_warning_enable = true;
var show_autofill_yet_in_section_warning_enable = true;
var no_autofill_requires_in_section_warning_enable = true;
//endregion only show these once (missing optional settings)

////// POLYFILLS //////

//see also https://stackoverflow.com/questions/1144783/how-to-replace-all-occurrences-of-a-string-in-javascript
//String.prototype.replaceAll = function(search, replace) {
    //if (replace === undefined) {
        //return this.toString();
    //}
    //return this.split(search).join(replace);
//}
String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.split(search).join(replacement);
};
//Speech.init({
    //'onVoicesLoaded': (data) => {console.log('voices', data.voices)},
    //'lang': 'en-GB', // specify en-GB language (no detection applied)
    //'volume': 0.5,
    //'rate': 0.8,
    //'pitch': 0.8
//});
//if(Speech.browserSupport()) {
    //console.log("speech synthesis supported")
//}

var ptcache = {}; // this is the custom plain text cache by file path
// "A polyfill is a script you can use to ensure that any browser will have an implementation of something you're using" -- FireSBurnsmuP Sep 20 '16 at 13:39 on https://stackoverflow.com/questions/7378228/check-if-an-element-is-present-in-an-array
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/includes
// https://tc39.github.io/ecma262/#sec-array.prototype.includes
// This is usually not used--see fun.array_contains instead
if (!Array.prototype.includes) { //if doesn't support ECMA 2016
	Object.defineProperty(Array.prototype, 'includes', {
		value: function(searchElement, fromIndex) {
			if ((this === null) || (this === undefined)) {
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

var storage_name = "data";
var storage_path = './' + storage_name; //formerly just storage_name
var groups_path = storage_path + "/groups.yml";
var permissions_path = storage_path + "/permissions.yml";

//We will be creating these two files shortly
var config = require(storage_path + '/config.js'), //config file contains all tokens and other private info
	fun = require('./functions.js'); //functions file contains our non-app-specific functions including those for our Passport and database work

var app = express();
app.use(express.static(__dirname + '/public'));
//app.enable('trust proxy');
app.set('trust proxy', 'loopback, linklocal, uniquelocal'); //NOTE: Allows req.ips, which derives from X-Forwarded-* and therefore is easily spoofed
//app.listen(8080);

if (!config.proxy_prefix_then_slash) config.proxy_prefix_then_slash = "/";
if (!config.hasOwnProperty("audio_enable")) config.audio_enable = true;
//var basePath = "./";
var basePath = "." + config.proxy_prefix_then_slash;


var tracking_sections = ["track"];

//var section_rates = {}; //how much client pays by the hour for section for time spent outside of startTime and endTime
//section_rates["care"] = 7.50;

var friendly_mode_names = {};
friendly_mode_names.create = "Entry Form";
friendly_mode_names.read = "History";
friendly_mode_names.modify = "Edit";
friendly_mode_names.reports = "Reports";

var friendly_mode_action_text = {};
friendly_mode_action_text.create = "Enter";
friendly_mode_action_text.read = "Save"; //save button since read will show editable fields if user has write priv to the section
friendly_mode_action_text.modify = "Save";
friendly_mode_action_text.reports = "Save";

//TODO: move all to _settings_defaults instead (<section>.friendly_names <section>.friendly_name etc)

//used for spreadsheet view/export (such as: change time to stated_time if stated_time was specified by user)
var section_fields_overrides = {};
section_fields_overrides.care = {"time":"stated_time", "date":"stated_date"};
section_fields_overrides.commute = {"time":"stated_time", "date":"stated_date"};

var fields_friendly_names = {};
//fields_friendly_names["heading"] = "select arriving/departing";

var never_save_fields = ["pin", "password", "section", "mode", "tmp"]; //and formerly "transaction_section"

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
//TODO: distinguish autofill between units for security and sense
var _selected_unit = 0;
var autofill_cache_path = storage_path + "/units/" + _selected_unit + "/autofill_cache." + autofill_cache_format;
var default_autofill_cache = {};
default_autofill_cache.care = {};
// default_autofill_cache.care.family_id = {"jake+gustafson+13":"-1", "jake+gustafson+0":"-1"};
// default_autofill_cache.care.qty = {"j&s+gustafson+0":"2"};
var default_total = {};
default_total.care = "=careprice()";
// var section_report_edit_field = {}; //runtime var, do not save (starts as value of _settings.section.mode.selected_field_default)


var _settings = null;
var settings_path = storage_path + "/units/" + _selected_unit + "/unit.yml";
var _settings_default = {};
_settings_default.unit = {};  // settings for current unit
_settings_default.unit.name = "Campus";
_settings_default.unit.enabled_sections = ["care", "commute", "admin", "track", "po"];
_settings_default.unit.selectable_modes = ["create", "read", "settings", "reports"];
_settings_default.unit.local_time_zone = "America/New_York";
_settings_default.admin = {};
_settings_default.admin.display_name = "Advanced";
_settings_default.care = {};
_settings_default.care.primary_category = "transactions";
_settings_default.care.primary_dataset_name = "student";
_settings_default.care.display_name = "Extended Care";
_settings_default.care.form_fields = ["first_name", "last_name", "chaperone", "grade_level", "family_id", "stated_time", "stated_date"];
_settings_default.care.form_collapsed_fields = ["family_id", "stated_time", "stated_date"];
_settings_default.care.form_display_names = {"first_name":"Student First Name", "last_name":"Student Last Name", "chaperone":"Pickup/Dropoff<br/>by&nbsp;Whom", "grade_level":"Grade", "stated_time":"Time (blank for auto, otherwise specify AM or PM)", "stated_date":"Date (blank for auto, otherwise must be in MM/DD/YYYY format)", "family_id":"Family ID (if applicable)", "pin":"override pin"};
_settings_default.care.required_fields = ["first_name", "last_name", "chaperone", "grade_level"];
_settings_default.care.sheet_fields = ["family_id", "=caretime_h()", "qty", "=careprice()", "=get_date_from_path()", "=get_origin_date()", "stated_date", "time", "stated_time", "first_name", "last_name", "grade_level", "chaperone", "created_by", "modified_by", "free_from", "free_to"];
_settings_default.care.sheet_display_names = {"=get_date_from_path()":"Stored", "=get_origin_date()":"Created", "=caretime()":"Seconds", "=caretime_h()":"Hours", "=careprice()":"Accrued per 1", "free_from":"Morning Care End", "free_to":"After School Start", "stated_time":"Stated Time", "stated_date":"Stated Date", "first_name":"First", "last_name":"Last", "grade_level":"Grade Level", "created_by":"By", "modified_by":"Modified", "chaperone":"Chaperone", "family_id":"FamilyID", "time":"Time", "qty":"Count"};
_settings_default.care.default_groupby = {};
_settings_default.care.default_groupby = "family_id";
_settings_default.care.extended_hours_hourly_price = 7.50;
_settings_default.care.local_start_time = '07:45:00';
_settings_default.care.local_end_time = '15:05:00';
_settings_default.care.bill_iso_day_of_week = 5;
_settings_default.care.reports = {};
_settings_default.care.reports.suggest_missing_required_fields_enable = true; //may cause slowness with loading reports when required fields are blank
_settings_default.care.reports.selected_field_default = "family_id";
_settings_default.care.reports.auto_select_month_enable = true;
_settings_default.care.reports.years_heading = "<h3>Billing</h3>";
_settings_default.care.reports.months_heading = "<h3>Reports</h3>";
_settings_default.care.list_implies_qty = "first_name";
_settings_default.care.list_implies_multiple_entries = "last_name";
_settings_default.care.list_implies_multiple_entries_paired_with = "first_name";
_settings_default.care.list_implies_multiple_entries_paired_with_unless_has_one = "grade_level";
_settings_default.care.autofill_equivalents = {}; //stores lists of irregular values (must be lowercase!) where key is normal value (any case but case will be used for normalized value)
_settings_default.care.autofill_equivalents.grade_level = {};
_settings_default.care.autofill_equivalents.grade_level.K5 = ["k","k-5", "k.5", "k 5", "kindergarten", "kindergarden", "kindegarten"];
_settings_default.care.autofill_equivalents.grade_level["1"] = ["first","1st"];
_settings_default.care.autofill_equivalents.grade_level["2"] = ["second","2nd"];
_settings_default.care.autofill_equivalents.grade_level["3"] = ["third","3rd"];
_settings_default.care.autofill_equivalents.grade_level["4"] = ["fourth","forth","4th"];
_settings_default.care.autofill_equivalents.grade_level["5"] = ["fifth","5th"];
_settings_default.care.autofill_equivalents.grade_level["6"] = ["sixth","6th"];
_settings_default.care.autofill_equivalents.grade_level["7"] = ["seventh","7th"];
_settings_default.care.autofill_equivalents.grade_level["8"] = ["eighth","eigth","8th"];
_settings_default.care.autofill_equivalents.grade_level["9"] = ["ninth","9th"];
_settings_default.care.autofill_equivalents.grade_level["10"] = ["tenth","10th"];
_settings_default.care.autofill_equivalents.grade_level["11"] = ["eleventh","11th"];
_settings_default.care.autofill_equivalents.grade_level["12"] = ["twelth","twelfth","12th"];
_settings_default.care.autofill_requires = {};
_settings_default.care.autofill_requires.family_id = ["first_name", "last_name", "grade_level"];
_settings_default.care.autofill_requires.qty = ["first_name"];
//NOTE: mid uses counting numbers, and last param is inclusive
_settings_default.care.history_sheet_fields = ["time", "qty", "=mid(first_name,1,1)", "=mid(last_name,1,1)", "grade_level", "chaperone", "family_id"];
_settings_default.care.mode_priority = ["reports","create", "read"];
_settings_default.commute = {};
_settings_default.commute.primary_category = "transactions";
_settings_default.commute.primary_dataset_name = "student";
_settings_default.commute.display_name = "Commute";
_settings_default.commute.field_lookup_values = {};
_settings_default.commute.field_lookup_values.heading = ["in", "out"];
_settings_default.commute.form_fields = ["name", "grade_level", "heading", "reason", "stated_time", "stated_date", "pin"];
_settings_default.commute.form_collapsed_fields = ["stated_time", "stated_date", "pin"];
_settings_default.commute.form_display_names = {"name":"Name", "grade_level":"Grade", "heading":"Heading", "reason":"Reason", "stated_time":"Custom Time (blank for auto, otherwise specify AM or PM)", "stated_date":"Custom Date (blank for auto, otherwise must be in MM/DD/YYYY format)", "pin":"override pin"};
_settings_default.commute.required_fields = ["name", "grade_level", "heading", "reason"];
_settings_default.commute.sheet_fields = ["=get_date_from_path()", "time", "heading", "name", "grade_level", "reason"];
_settings_default.commute.sheet_display_names = {"=get_date_from_path()":"Date", "grade_level":"Grade Level"};  // "time":"Time"
_settings_default.commute.history_sheet_fields = ["time", "name", "grade_level", "reason"];  // "=get_date_from_path()",
_settings_default.commute.local_start_time = '08:10:00';
_settings_default.commute.local_end_time = '15:05:00';
_settings_default.commute.reports = {};
_settings_default.commute.reports.suggest_missing_required_fields_enable = true; //may cause slowness with loading reports when required fields are blank
_settings_default.commute.reports.auto_select_month_enable = true; //ok since in reports section
_settings_default.commute.mode_priority = ["reports","create", "read"];
_settings_default.track = {};
_settings_default.track.primary_category = "status";
_settings_default.track.primary_dataset_name = "MAC";
_settings_default.track.display_name = ["Track"];
_settings_default.track.form_fields = ["UserName", "MachineName", "HostName", "MAC"];
_settings_default.track.required_fields = ["MAC"];
_settings_default.track.form_display_names = {"mac":"HwAddr"};
_settings_default.track.sheet_fields = ["MAC","MachineName","UserName","HostName"];
_settings_default.track.status_keys = ["MAC"];
//TODO: employee leave request (aka absence request)
_settings_default.po = {};
_settings_default.po.primary_category = "tables";
_settings_default.po.primary_dataset_name = "PurchaseOrder";
_settings_default.po.minimum_key_values = {"po_number":4213}; //TODO: asdf implement this
_settings_default.po.key_field = "po_number";  //TODO: asdf implement this
_settings_default.po.prefill_methods = {"stated_date":"date()"}; //TODO: asdf implement this
_settings_default.po.sheet_fields = ["po_number","vendor", "stated_date", "shipping", "total", "budget_account", "ordered_by", "approved_by"];
_settings_default.po.form_fields = ["po_number","vendor", "stated_date", "vendor_phone", "vendor_addr_lines_i_0", "vendor_addr_lines_i_1", "vendor_city", "vendor_state", "vendor_zip", "vendor_country"];
for (var i=0; i<18; i++) {
	_settings_default.po.form_fields.push("qty_i_"+i);
	_settings_default.po.form_fields.push("order_no_i_"+i);
	_settings_default.po.form_fields.push("desc_i_"+i);
	_settings_default.po.form_fields.push("unit_cost_i_"+i);
	_settings_default.po.form_fields.push("amount_i_"+i);
}
_settings_default.po.form_fields.push("shipping");
_settings_default.po.form_fields.push("total");
_settings_default.po.form_fields.push("budget_account");
_settings_default.po.form_fields.push("budget_account_other");
_settings_default.po.form_fields.push("ordered_by");
_settings_default.po.required_fields = ["po_number","vendor", "stated_date", "qty_i_0", "desc_i_0", "unit_cost_i_0", "shipping", "total", "ordered_by"];
//var startTimeString = startTime.format("HH:mm:ss");
//var endTimeString = endTime.format("HH:mm:ss");
//var startTime = moment('08:10:00', "HH:mm:ss");
//var endTime = moment('15:05:00', "HH:mm:ss");

var default_mode_by_user = {};
default_mode_by_user.care = "create";
default_mode_by_user.commute = "create";
default_mode_by_user.attendance = "read";
default_mode_by_user.accounting = "reports";


var _groups = null; //load from groups_path
var _default_groups = {};
_default_groups.admin = ["admin"];
_default_groups.care = ["admin", "accounting", "care"];
_default_groups.accounting = ["admin", "accounting"];
_default_groups.commute = ["admin", "attendance", "commute"];
_default_groups.attendance = ["admin", "attendance"];
_default_groups.readattendance = ["attreaduser"];

var _permissions = null; //load from permissions_path
var _default_permissions = {}; // permission.<group>.<section> equals array of permissions
_default_permissions.admin = {};
_default_permissions.admin.admin = ["create", "read", "modify", "reports", "settings", "poke-settings", "billing"];
_default_permissions.admin.care = ["create", "read", "modify", "reports", "customtime", "settings", "change-section-settings", "billing"];
_default_permissions.admin.commute = ["create", "read", "modify", "reports", "billing"];
_default_permissions.admin.track = ["create", "read", "modify", "reports"];
_default_permissions.care = {};
_default_permissions.care.care = ["create", "read", "customtime"];
_default_permissions.accounting = {};
_default_permissions.accounting.care = ["create", "read", "modify", "reports", "customtime", "change-section-settings", "billing"];
_default_permissions.commute = {};
_default_permissions.commute.commute = ["create"];
_default_permissions.attendance = {};
_default_permissions.attendance.commute = ["create", "read", "reports"];
_default_permissions.readattendance = {};
_default_permissions.readattendance.commute = ["read"];

var dat = null; //TODO: deprecate this (idiosyncratic cache) in favor of fsc
var fsc = null;  // this is the cache (direct filesystem cache relative to data/units folder)

function get_yaml_objects_recursively(path, name) {
	var results = {};
	// The only way to distinguish between folder and file using this system is to make sure folder name never contains dot, and file name always does.
	// (this is ok since "files" category is never cached by this method)
	var fis = fun.getVisibleFiles(path);
	var dis = fun.getVisibleDirectories(path);
	for (var f_i = 0; f_i < fis.length; f_i++) {
		if (fis[f_i].endsWith(".yml")) {
			var f_path = path + "/" + fis[f_i];
			results[fis[f_i]] = yaml.readSync(f_path);
		}
	}
	for (var d_i = 0; d_i < dis.length; d_i++) {
		//if (name != "files") {
			var d_path = path + "/" + dis[d_i];
			results[dis[d_i]] = get_yaml_objects_recursively(d_path, dis[d_i]);
		//ignore this condition since caching files only happens for yml anyway, and caching ones from files dir is cheap and may someday be useful
		//}
		//else could be big--save for later reading, or for ptcache
	}
	return results;
}

function regenerate_cache() {
	//if (!fsc) {
	fsc = {};
	//}
	if (!fs.existsSync(storage_path))
		fs.mkdirSync(storage_path);
	var units_path = storage_path + "/units";
	if (!fs.existsSync(units_path))
		fs.mkdirSync(units_path);
	else {
		var units = fun.getVisibleDirectories(units_path);
		for (var u_i = 0; u_i < units.length; u_i++) {
			var unit = units[u_i];
			fsc[unit] = {};
			var unit_path = units_path + "/" + unit;
			var sections = fun.getVisibleDirectories(unit_path);
			for (var s_i = 0; s_i < sections.length; s_i++) {
				var section = sections[s_i];
				fsc[unit][section] = {};
				var section_path = unit_path + "/" + section;
				console.log("[ + ] caching " + section_path + " (in "+unit_path+")");
				var categories = fun.getVisibleDirectories(section_path);
				//removed the commented parts in order to keep reload_cache independent of implementation
				//var category_enable = {};
				//var category_count = 0;
				//var categories_enabled_count = 0;
				for (var c_i = 0; c_i < categories.length; c_i++) {
					var category = categories[c_i]; // a category is actually a storage type (a folder/file arrangement method)
					var cat_path = section_path + "/" + category;
					console.log("[ + ] caching " + cat_path + " (in "+categories.length+" total)");
					fsc[unit][section][category] = {};
					//fsc[unit][section][category] = get_yaml_objects_recursively(cat_path, category);
					var dataset_names = fun.getVisibleDirectories(cat_path);
					for (var t_i = 0; t_i < dataset_names.length; t_i++) {
						var dataset_name=dataset_names[t_i];
						var dataset_path=cat_path+"/"+dataset_name;
						fsc[unit][section][category][dataset_name] = get_yaml_objects_recursively(dataset_path, dataset_name);
					}
					//category_enable[category] = false;
					//category_count++;
				}
				//if (fsc[unit][section].hasOwnProperty("tables")) {
						// numbered, but contains millions then thousands folders before files
						// such as data/units/0/care/tables/BillingCycle/0/0/0.yml
						//      or data/units/0/care/tables/BillingCycle/0/9/9001.yml
				//	category_enable["tables"] = true;
				//	categories_enabled_count++;
				//	var dataset_names = fun.getVisibleDirectories(cat_path);

				//}
				//if (categories_enabled_count < category_count) {
				//	console.log("[ + ] WARNING in regenerate_cache: the following dataset storage methods (categories) in "++" were not recognized")
				//}
			}
		}
	}
	console.log("caching is finished.")
}

function load_permissions(reason, req) {
	if (_permissions === null) {
		if (fs.existsSync(permissions_path)) {
			_permissions = yaml.readSync(permissions_path);
			if (req!==null) req.session.success = "Successfully loaded "+permissions_path+" due to "+reason+".";
			console.log("[ + ] loaded permissions");
		}
		else {
			_permissions = JSON.parse(JSON.stringify(_default_permissions));
			yaml.write(permissions_path, _permissions, "utf8", function (err) {
				if (err) {
					console.log("[ !+ ] saving "+permissions_path+"..."+err);
				}
				else console.log("[ !+ ] saving "+permissions_path+"...OK");
			});
			//req.session.notice = "WARNING: "+permissions_path+" could not be read in /reload-permissions-and-groups, so loaded then saved defaults there instead.";
		}
	}
}

function get_all_permitted_users() {
	ret = [];
	for (var group_name in _groups) {
		if (_groups.hasOwnProperty(group_name)) {
			group = _groups[group_name];
			for (var user_i=0; user_i<group.length; user_i++) {
				username = group[user_i];
				if (ret.indexOf(username) < 0) {
					//avoid dups (person in more than one group)
					ret.push(username);
					// console.log("get_all_permitted_users: (group "+group_name+")" + username);
				}
			}
		}
	}
	return ret;
}

function load_groups(reason, req) {
	if (_groups === null) {
		if (fs.existsSync(groups_path)) {
			_groups = yaml.readSync(groups_path);
			if (req!==null) req.session.success = "Successfully loaded "+groups_path+" due to "+reason+".";
			console.log("[ + ] loaded groups");
		}
		else {
			_groups = JSON.parse(JSON.stringify(_default_groups));
			yaml.write(groups_path, _groups, "utf8", function (err) {
				if (err) {
					console.log("[ !+ ] saving "+groups_path+"..."+err);
				}
				else console.log("[ !+ ] saving "+groups_path+"...OK");
			});
		}
	}
}


//in nodejs 4.2.6 (Ubuntu Xenial), `app.on('listening', ...` crashes with:
//events.js:141
//      throw er; // Unhandled 'error' event
//and never fires in node 9.3.0 (even if declared before running app.listen [which is usually at end of file anyway]); tried "npm install startup" but that didn't help.
//so code was copied to end of this script instead of being inside of an event handler
//app.on('ready', function (server) {
//	console.log("[ listening ] ...");
//    // server ready to accept connections here
//	load_permissions("service starting", null);
//	load_groups("service starting", null);
//});

//returns true if modified record (never true if change_record_object_enable is false)
function autofill(unit, section, record, change_record_object_enable) {
	var results = {};
	results.filled_fields = [];
	//TODO: asdf use unit
	if (fun.is_blank(unit)) {
		unit = null;
		results.error = "ERROR in autofill: unit not specified";
		console.log("[ !@ ] "+results.error);
	}
	if (fun.is_blank(section)) {
		results.error = "ERROR in autofill: section not specified";
		console.log("[ !@ ] "+results.error);
	}
	if ((unit!==null) && (section!==null)) {
		//NOTE: OK if not in fsc--since being written
		if (has_setting(unit, section+".autofill_requires")) {
			//if (default_groupby.hasOwnProperty(section)) {
			for (var requirer in _settings[section].autofill_requires) {
				//each requirer requires a list of fields, as seen in list iteration below within this key loop
				var present_count = 0;
				var combined_primary_key = null;
				for (var sar_i=0; sar_i<_settings[section].autofill_requires[requirer].length; sar_i++) {
					if (_settings[section].autofill_requires[requirer][sar_i]!==undefined) {
						//console.log("[ ~ ] looking for required field named "+_settings[section].autofill_requires[requirer][sar_i]);
						var key = _settings[section].autofill_requires[requirer][sar_i];
						var normal_value_as_key;
						var irregularity_lists;
						if (change_record_object_enable) {
							if (has_setting(unit, section+".autofill_equivalents."+key)) {
								//for example, care.autofill_equivalents.grade_level is an object which contains a list with key k5 and values such as k-5 (and additional list for each expected grade_level)
								//console.log("[ ~ ] checked irregularity list: found list for "+key+" in "+section);
								irregularity_lists = peek_setting(unit, section+".autofill_equivalents."+key);
								for (normal_value_as_key in irregularity_lists) {
									//if (irregularity_lists.hasOwnProperty(normal_value_as_key)) {
										var irregularity_list = irregularity_lists[normal_value_as_key];
										for (var il_i=0, il_len=irregularity_list.length; il_i<il_len; il_i++) {
											if ( (key in record) && ((typeof record[key])=="string") && (record[key].toLowerCase() == irregularity_list[il_i]) ) {
												console.log("  [ ~ ] normalizing "+record.key+" value "+record[key]+" in "+section+" to new value "+normal_value_as_key);
												record[key] = normal_value_as_key;
												results.filled_fields.push(key);
											}
											//else console.log("  [ ~ ] verbose message: "+record[key].toLowerCase()+" is not irregular "+irregularity_list[il_i]);
										}
									//}
								}
							}
							//else console.log("[ ~ ] checked irregularity list: none for " + key + " in " + section);
						}
						//else console.log("[ ~ ] skipping regularity check since change_record_object_enable is false");

						var val = "";
						if (key in record) { //hasOwnProperty(key) doesn't work--why doesn't this work?
							var cache_as_value = record[key].replaceAll("+","&").toLowerCase().trim();
							if (has_setting(unit, section+".autofill_equivalents."+key)) {
								if (irregularity_lists===null) //if change_record_object_enable, this wouldn't be loaded yet
									irregularity_lists = peek_setting(unit, section+".autofill_equivalents."+key);
								for (normal_value_as_key in irregularity_lists) {
									var irregular_values = irregularity_lists[normal_value_as_key];
									if (fun.array_contains(irregular_values,cache_as_value)) {
										cache_as_value = normal_value_as_key.toLowerCase();
										break;
									}
								}
							}

							if (combined_primary_key===null) combined_primary_key = cache_as_value;
							else combined_primary_key += "+" + cache_as_value;
							present_count++;
							//console.log("[ ?@ ] verbose message: "+key+" present");
						}
						else {
							//console.log("[ ?@ ] verbose message: "+key+" not present");
							//NOTE: can't autofill here, since can't possibly meet all required fields for an autofill since key is an autofill requirement
						}
						//else console.log("[ ?@ ] verbose message: "+key+" not present");
					}
					else console.log("ERROR: index "+sar_i+" in autofill_requires for section "+section+" property "+requirer+" is undefined!");
				}
				if ( present_count>0 && (present_count==_settings[section].autofill_requires[requirer].length) ) {  //id_user_within_microevent[section].length) {
					//console.log("[ ?@ ] combined_primary_key is complete to fill "+requirer+": "+combined_primary_key);
					if (!(record.hasOwnProperty(requirer)&&fun.is_not_blank(record[requirer]))) {
						if (change_record_object_enable) {
							if ( autofill_cache.hasOwnProperty(section) &&
								 autofill_cache[section].hasOwnProperty(requirer) &&
								 autofill_cache[section][requirer].hasOwnProperty(combined_primary_key)
							) {
								results.filled_fields.push(requirer);
								record[requirer] = autofill_cache[section][requirer][combined_primary_key];
								console.log("[ =@ ] (verbose message) cache hit: since autofill_cache["+section+"]["+requirer+"]["+combined_primary_key+"] was "+record[requirer]);
							}
							//else console.log("[ /@ ] (verbose message) cache miss: since autofill_cache["+section+"]["+requirer+"] does not have "+combined_primary_key);
						}
					}
					else {
						if (!autofill_cache.hasOwnProperty(section)) autofill_cache[section] = {};
						if (!autofill_cache[section].hasOwnProperty(requirer)) autofill_cache[section][requirer] = {};
						if (fun.is_not_blank(record[requirer])) {
							autofill_cache[section][requirer][combined_primary_key] = record[requirer];
							//json.writeFile(autofill_cache_path, autofill_cache);
							save_autofill_cache("since updated combined_primary_key "+combined_primary_key);
						}
						else console.log("[ _@ ] verbose message: cache not written for "+requirer+" since blank for "+JSON.stringify(_settings[section].autofill_requires[requirer])+": "+fun.get_row(record, _settings[section].autofill_requires[requirer]));
					}
				}
				else console.log("[ _@ ] cache not written for "+requirer+" since count of related field(s) entered is "+present_count+" not "+_settings[section].autofill_requires[requirer].length);//id_user_within_microevent[section].length);
			}
		}
		else {
			results.error = "[ !@ ] cannot autofill since section does not have autofill requirements";
		}
	}
	return results;
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
	if (scope_stack === null) scope_stack = [];
	scope = _settings;
	var name = "";
	for (var i=0, len=scope_stack.length; i<len; i++) {
		scope = scope[scope_stack[i]];
		if (name==="") name=scope_stack[i];
		else name+="."+scope_stack[i];
	}
	if (!scope) console.log("--Uh oh, "+JSON.stringify(scope_stack)+" aka "+name+" is undefined");
	else console.log("--checking "+JSON.stringify(scope_stack)+" aka "+name);
	console.log("_get_settings_names_recursively: scope at "+name);
	if ( (typeof scope === "object") && (scope !== null) ) {
		for (var key in scope) {
			//if (scope.hasOwnProperty(key)) {  //TODO? hasOwnProperty fails in certain other places--why doesn't this work?
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
	//	for (var i=0; i<scope_stack.length; i++) {
	//		var key = scope_stack[i];
	//	}
	//}
	//asserted_depth-=1;
}

function poke_setting(unit, dot_notation, val) {
	if (_settings===null)  check_settings();
	//var scope = [];
	//dot_notation = section+"."+dot_notation;
	var scope_stack = dot_notation.split(".");
	var scope_o = null;
	if (!_settings) {
		_settings = {};
		console.log("WARNING: In poke_setting, null _settings (now set to empty object)");
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
			//for (var key in scope_o) {
			//	if (scope_o.hasOwnProperty(key)) {
			//		console.log("  [ . ] * "+key+": "+scope_o[key]);
			//	}
			//}
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
			for (var i=0; i<scope_stack.length; i++) {
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

function peek_setting(unit, dot_notation) {
	//TODO: actually use unit
	if (_settings===null)  check_settings();
	var result = null;
	if (dot_notation && ((typeof dot_notation)=="string")) {
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
	else console.log("WARNING: tried to peek with missing dot_notation "+JSON.stringify(dot_notation));
	return result;
}

has_setting_write_callback = function (err) {
		if (err) {
			return console.log("[ . ] Error while saving settings from a default setting: " + err);
		}
		else console.log("[ . ]: setting was missing so default written");// for: "+dot_notation);
};

//use dot notation aka "trail" to get deeper yaml scope starting with highest key
function has_setting(unit, dot_notation) {
	if (_settings===null)  check_settings();
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
		if (peek_setting(unit, dot_notation)===null) {
			//console.log("  [ . ] checking for "+dot_notation);
			var this_scoped = _settings;
			var default_scoped = _settings_default;
			for (var i=0, len=scope_stack.length; i<len; i++) {
				if (!this_scoped.hasOwnProperty(scope_stack[i])) {
					if (default_scoped.hasOwnProperty(scope_stack[i])) {
						this_scoped[scope_stack[i]] = JSON.parse(JSON.stringify(default_scoped[scope_stack[i]]));
						//yaml.writeSync(settings_path, _settings, "utf8");
						yaml.write(settings_path, _settings, "utf8", has_setting_write_callback);
						break;
					}
					else break;
				}
				this_scoped = this_scoped[scope_stack[i]];
				if (default_scoped.hasOwnProperty(scope_stack[i])) {
					default_scoped = default_scoped[scope_stack[i]];
				}
				else {
					default_scoped = null;
					break;  // don't find setting and write it, since setting doesn't exist
				}
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

function user_has_section_permission(unit, this_username, this_section, this_permission) {
	var result = false;
	//console.log("user_has_section_permission of "+this_username+" for "+this_section+":");
	if (this_username=="admin") {
		result = true;
	}
	else {
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
	}
	return result;
}
function user_has_pinless_time(unit, section, username) {
	return user_has_section_permission(unit, username, section, "customtime");
}

//===============PASSPORT===============

// Passport session setup.
passport.serializeUser(function(user, done) {
	console.log("* passport serializing ", user);
	done(null, user);  // TODO: should be user.id as per <http://www.passportjs.org/docs/>
});

passport.deserializeUser(function(id, done) {
	console.log("* passport deserializing ", id);
	done(null, id);
	//changed to id and above removed and below added, as per <http://www.passportjs.org/docs/>
	//"The serialization and deserialization logic is supplied by the application, allowing the application to choose an appropriate database and/or object mapper, without imposition by the authentication layer."
	//TODO: ? deserialize manually
	//User.findById(id, function(err, user) {
	//	done(err, user);
	//});
});

// Use the LocalStrategy within Passport to login/"signin" users.
// NOTE: 'info' can be set by the strategy's verify callback
// if string param before strategy is not set (such as 'local-login') then strategy.name is used (such as 'local' in the case of LocalStrategy)--see ./node_modules/passport/lib/authenticator.js
passport.use(new LocalStrategy(
	{passReqToCallback: true,
	 usernameField: 'username',
	 passwordField:'password'}, //see ./node_modules/passport-local/lib/strategy.js
	function(req, username, password, verified) { //verified formerly done--see passport-local/lib/strategy.js
		//(all logging is made available to the /login route, otherwise the promise chain is incomplete)
		// added return before verified as per <http://www.passportjs.org/docs/>
		//strategy.js notes:
		//* only sends req if `passReqToCallback: true`
		//* verified(err, user, info):
		//  if (err) { return self.error(err); }
		//  if (!user) { return self.fail(info); }
		//  self.success(user, info);

		// results of below logging (behavior defined by passport-local/lib/strategy.js):
		// * missing username/password: then(false, undefined)
		// * incorrect username/password: then(false, undefined); however, deferred.resolve(false, 'bad username'); must have been called due to logging above it
		//console.log("(verbose message in use('local-login')) calling fun.localAuth...");
		fun.localAuth(username, password)
		.then(function (user) {
			// deferred can only return one value (see `resolve` in localAuth; Q's defer uses callbacks as promises), so MANUALLY check if it is a real user object or an error:
			if (user.hasOwnProperty('error')) {
				// console.log("* COULD NOT LOG IN: " + user.error);
				req.session.error = 'Username or password incorrect.'; //inform user could not log them in
				// only return first param if it is an Error object (from reject)
				return verified(null, user, {message: 'username or password failed'});
			}
			else {
				// console.log("* LOGGED IN AS: " + user.username);
				// req.session.success = 'You are successfully logged in ' + user.username + '!';
				return verified(null, user, {message: 'success'});
			}
		})
		.fail(function (err){
			// called if deferred uses reject
			// console.log("* FAILED during login: ", err);  // shows everything including stack trace
			return verified(new Error("database connection failed"));  // standard node style is to return error if exception occurred
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
							req.session.error = 'That username is already in use, please try a different one.'; //inform user could not log them in
							done(null, user);
						}
						else {
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
						console.log(" ", err);
						if (err.body) {
							req.session.error = err.body;
						}
						else {
							//this should never happen if reject is programmed correctly
							req.session.error = "localReg failed but did not return an error.";
						}
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
//app.configure(function() {  // removed in express 4
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
		success = req.session.success,
		setup_banner = req.session.setup_banner,
		missing_users = req.session.missing_users;

	delete req.session.error;
	delete req.session.setup_banner;
	delete req.session.missing_users;
	delete req.session.success;
	delete req.session.notice;

	if (err) res.locals.error = err;
	if (msg) res.locals.notice = msg;
	if (success) res.locals.success = success;
	if (setup_banner) res.locals.setup_banner = setup_banner;
	if (missing_users) res.locals.missing_users = missing_users;

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
function get_filtered_form_fields_html(unit, section, mode, username, show_collapsed_only_enable, prefill, missing_fields) {
	var ret="";
	//TODO: asdf use unit
	if (has_setting(unit, section+".form_fields")) {
		var section_form_fields = peek_setting(unit, section+".form_fields");
		for (var i = 0, len = section_form_fields.length; i < len; i++) {
			var friendly_name = section_form_fields[i];
			var field_name = section_form_fields[i];

			if (!has_setting(unit, section+".form_collapsed_fields")) {
				console.log("(verbose message in get_filtered_form_fields_html) missing optional "+section+".form_collapsed_fields setting");
			}
			var section_form_collapsed_fields = null;
			if ( !(has_setting(unit, section+".form_collapsed_fields")) && show_collapsed_only_enable)
				return ret; //only show fields once if no collapsed fields are specified (return blank here since called twice once true once false)
			else {
				section_form_collapsed_fields = peek_setting(unit, section+".form_collapsed_fields");
			}
			if ( (!has_setting(unit, section+".form_collapsed_fields")) ||
				 (!show_collapsed_only_enable && !fun.array_contains(section_form_collapsed_fields, field_name )) ||
				 (show_collapsed_only_enable && fun.array_contains(section_form_collapsed_fields, field_name )) ) {
				var superscript="";
				if (missing_fields && fun.array_contains(missing_fields, field_name)) superscript='<span style="color:red"><strong>*</strong></span>';
				if (has_setting(unit, section+".form_display_names."+friendly_name)) friendly_name = peek_setting(unit, section+".form_display_names."+friendly_name);
				var prefill_value = "";
				if (prefill && (prefill.hasOwnProperty(field_name))) prefill_value = prefill[field_name];
				if (has_setting(unit, section+".field_lookup_values."+field_name)) {
					var field_lookup_values = peek_setting(unit, section+".field_lookup_values."+field_name);
					ret += '<div class="form-group">' + "\n";
					if (show_collapsed_only_enable) ret += '  <label class="control-label col-sm-2" style="color:darkgray">'+friendly_name+superscript+':</label>' + "\n";
					else ret += '  <label class="control-label col-sm-2" >'+friendly_name+superscript+':</label>' + "\n";
					ret += '  <div class="col-sm-10">' + "\n";
					ret += '    <div class="btn-group" data-toggle="buttons">' + "\n";
					var precheck="";
					var precheck_class="";
					for (var choice_i = 0, choice_len = field_lookup_values.length; choice_i < choice_len; choice_i++) {
						if (prefill_value==field_lookup_values[choice_i]) {
							precheck=' checked="checked"';// aria-pressed="true" is not required except for button
							precheck_class=' active';
						}
						else {
							precheck='';
							//console.log("prefill_value:"+prefill_value)
							//console.log("  field_lookup_values[choice_i]:"+field_lookup_values[choice_i])
						}
						var this_friendly_name = field_lookup_values[choice_i];
						ret += '      <label class="btn btn-primary'+precheck_class+'"><input type="radio" name="'+field_name+'" value="'+field_lookup_values[choice_i]+'"'+precheck+'>'+this_friendly_name+'</label>' + "\n";
					}
					ret += '    </div>' + "\n";
					ret += '  </div>' + "\n";
					ret += '</div>' + "\n";
				}
				else {
					//console.log("prefill_value:"+prefill_value)
					ret += '  <div class="form-group">' + "\n";
					if (show_collapsed_only_enable) ret += '  <label class="control-label col-sm-2" style="color:darkgray">'+friendly_name+superscript+':</label>' + "\n";
					else ret += '  <label class="control-label col-sm-2" >'+friendly_name+superscript+':</label>' + "\n";
					ret += '    <div class="col-sm-10">' + "\n";
					ret += '      <input type="text" class="form-control" name="'+field_name+'" value="'+prefill_value+'"/>' + "\n";
					ret += '    </div>' + "\n";
					ret += '  </div>' + "\n";
				}
			}
		}
	}
	else {
		ret = '<div class="alert alert-warning">missing setting ' + section + '.form_fields</div>';
	}
	return ret;
}

// this method does not look up data, it receives data and formats it
function get_year_month_select_buttons(unit, section, dataset_name, mode, username, years, months, selected_year, selected_month) {
	var ret = "";
	var category="transactions";
	//var years = get_transaction_years(unit, section, dataset); //see "deprecated - js.md"
	var years_heading = "Year:";
	if (has_setting(unit, section+"."+mode+".years_heading"))
		years_heading = peek_setting(unit, section+"."+mode+".years_heading"); //such as <h3>Billing</h3>
	ret += '<div>'+years_heading+"\n";
	var i=0;
	for (i=0, len=years.length; i<len; i++) {
		ret += '<form action="'+config.proxy_prefix_then_slash+'" method="get">' + "\n";
		ret += '  <input type="hidden" name="unit" id="unit" value="'+unit+'"/>' + "\n";
		ret += '  <input type="hidden" name="section" id="section" value="'+section+'"/>' + "\n";
		ret += '  <input type="hidden" name="category" id="category" value="'+category+'"/>' + "\n";
		ret += '  <input type="hidden" name="dataset_name" id="dataset_name" value="'+dataset_name+'"/>' + "\n";
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
		ret += '</form>' + "\n";
	}
	ret += '</div>' + "\n";
	var months_heading = "Month:";
	if (has_setting(unit, section+"."+mode+".months_heading"))
		months_heading = peek_setting(unit, section+"."+mode+".months_heading");  // such as <h3>Reports</h3>
	ret += '<div>'+months_heading+"\n";
	for (i=0, len=months.length; i<len; i++) {
		ret += '<form action="'+config.proxy_prefix_then_slash+'" method="get">' + "\n";
		ret += '<input type="hidden" name="unit" id="unit" value="'+unit+'"/>' + "\n";
		ret += '<input type="hidden" name="section" id="section" value="'+section+'"/>' + "\n";
		ret += '<input type="hidden" name="category" id="category" value="'+category+'"/>' + "\n";
		ret += '<input type="hidden" name="dataset_name" id="dataset_name" value="'+dataset_name+'"/>' + "\n";
		ret += '<input type="hidden" name="mode" id="mode" value="'+mode+'"/>';
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
		ret += '</form>' + "\n";
	}
	ret += '</div>' + "\n";
	return ret;
}

function get_care_time_info(this_item, unit, section) {
	var result = {};
	//NOTE: startTime and endTime define school day
	var foundTime = null;
	var foundTimeString = null;
	var local_time_zone = null;
	if (has_setting(unit, "unit.local_time_zone")) local_time_zone = peek_setting(unit, "unit.local_time_zone");
	//if (Date.format("HH:mm:ss") > Date.parse("15:05:00"))
	var local_now = moment();
	if (local_time_zone!==null) local_now = moment().tz(local_time_zone);
	else console.log("ERROR: missing unit.local_time_zone setting during get_care_time_info");

	// The code below the comment works since both are normally in same timezone.
	// However, there may be issues since timezone offset (in yml) is not checked.

	//if (this_item.hasOwnProperty("time")) {
	//	if (fun.is_not_blank(this_item.time)) {
	//		foundTime = moment(this_item.time, "HH:mm:ss");
	//		foundTimeString = moment(this_item.time, "HH:mm:ss").format("HH:mm:ss");
	//	}
	//}
	foundTime = moment(fun.good_time_string(this_item.tmp.time), "HH:mm:ss");
	foundTimeString = foundTime.format("HH:mm:ss");
	if (this_item.hasOwnProperty("stated_time")) {
		if (fun.is_not_blank(this_item.stated_time)) {
			//foundTime = moment(fun.good_time_string(this_item.stated_time), "HH:mm:ss");
			//foundTimeString = foundTime.format("HH:mm:ss");
			if (fun.visual_debug_enable) {
				if (foundTimeString!=this_item.stated_time) result.warning = "stated_time: " + this_item.stated_time + " converted to 24-hr format: " + foundTimeString;
			}
		}
	}

	if (foundTime!==null) {
		if (!section) console.log("ERROR: no section given to get_care_time_info");
		if ( has_setting(unit, section+".local_start_time") && //&& _settings[section].hasOwnProperty("local_start_time")
			 has_setting(unit, section+".local_end_time") //_settings[section].hasOwnProperty("local_end_time")
			) {
			var startTimeString = peek_setting(unit, section+".local_start_time");
			var startTime = moment(startTimeString, "HH:mm:ss");
			if (this_item.hasOwnProperty("free_from") && fun.is_not_blank(this_item.free_from)) {
				startTimeString = fun.good_time_string(this_item.free_from);
				startTime = moment(startTimeString, "HH:mm:ss");
			}
			var endTimeString = peek_setting(unit, section+".local_end_time");
			var endTime = moment(endTimeString, "HH:mm:ss");
			if (this_item.hasOwnProperty("free_to") && fun.is_not_blank(this_item.free_to)) {
				endTimeString = fun.good_time_string(this_item.free_to);
				endTime = moment(endTimeString, "HH:mm:ss");
			}
			foundTime = moment(foundTimeString, "HH:mm:ss");
			//see also http://momentjs.com/docs/#/manipulating/difference/
			if (endTime.format("HHmmss") < startTime.format("HHmmss")) {
				result.error = "Free time range was not valid--should be start to end but is reversed: from " + startTimeString + " to " + endTimeString;
			}
			if (foundTime.format("HHmmss") > endTime.format("HHmmss")) {
				result.seconds = foundTime.diff(endTime, 'seconds');
				if (result.seconds <= 0) {
					result.warning = "Time span (" + result.seconds + ") set to zero for after hours time " + foundTime.format("HHmmss") + " (input: " + foundTimeString + ")--free from " + startTime.format("HHmmss") + " to " + endTime.format("HHmmss");
					result.seconds = 0.0;
				}
			}
			else if (foundTime.format("HHmmss") < startTime.format("HHmmss")) {
				result.seconds = startTime.diff(foundTime, 'seconds');
				if (result.seconds <= 0) {
					result.warning = "Time span (" + result.seconds + ") set to zero for before hours time " + foundTime.format("HHmmss") + " (input: " + foundTimeString + ")--free from " + startTime.format("HHmmss") + " to " + endTime.format("HHmmss");
					result.seconds = 0.0;
				}
			}
			else {
				result.seconds = 0.0;
				//result.warning = "Care time was zero for time " + foundTime.format("HHmmss") + " (from string " + foundTimeString + ") vs start time " + startTime.format("HHmmss") + " (from string " + startTimeString + ") and end time " + endTime.format("HHmmss") + " (from string " + endTimeString + ")";
				result.warning = "Time span was free for time " + foundTime.format("HHmmss") + " (input: " + foundTimeString + ")--free from " + startTime.format("HHmmss") + " to " + endTime.format("HHmmss");
			}
		}
		else result.error = ("WARNING: For get_care_time_info, " + section.format("HHmmss") + ".local_start_time and " + section + ".local_end_time must be set in " + settings_path + " (for building status features, and for extended hours billing feature)");
	}
	else result.seconds = 0.0;
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

function get_day_info(dataset_cache, ymd_array) {
	var results = {};
	results.enable = false;
	if (ymd_array.length === 3) {
		if (fun.is_not_blank(ymd_array[0])) {
			var year = ymd_array[0];
			if (dataset_cache.hasOwnProperty(year)) {
				if (fun.is_not_blank(ymd_array[1])) {
					var month = ymd_array[1];
					if (dataset_cache[year].hasOwnProperty(month)) {
						if (fun.is_not_blank(ymd_array[2])) {
							var day = ymd_array[2];
							if (dataset_cache[year][month].hasOwnProperty(day)) {
								results.enable = true;
							}
							else results.error = year + "-" + month + "-" + day + ' has no records.';
						}
						else results.error = 'day was not specified.';
					}
					else results.error = year + "-" + month + ' has no records.';
				}
				else results.error = 'month was not specified.';
			}
			else results.error = 'year ' + year + ' has no records.';
		}
		else results.error = 'year was not specified.';
	}
	return results;
}

function get_dataset_info(unit, section, category, dataset_name) {
	var results = {};
	results.enable = false;
	if (fun.is_not_blank(unit)) {
		if (fsc.hasOwnProperty(unit)) {
			if (fun.is_not_blank(section)) {
				if (fsc[unit].hasOwnProperty(section)) {
					if (fun.is_not_blank(category)) {
						if (fsc[unit][section].hasOwnProperty(category)) {
							if (fun.is_not_blank(dataset_name)) {
								if (fsc[unit][section][category].hasOwnProperty(dataset_name)) {
									results.enable = true;
									results.dataset_path = storage_path + "/units/" + unit + "/" + section + "/" + category + "/" + dataset_name;
								}
								else results.error='dataset ' + dataset_name + ' does not exist.';
							}
							else results.error='dataset_name was not specified.';
						}
						else results.error='category ' + category + ' does not exist in unit '+unit+' section '+section+'.';
					}
					else results.error='category was not specified.';
				}
				else results.error='section ' + section + ' does not exist in unit '+unit+'.';
			}
			else results.error='section was not specified.';
		}
		else results.error='unit ' + unit + ' does not exist.';
	}
	else results.error='unit was not specified.';
	return results;
}


function get_dataset_path_if_exists_else_null(unit, section, category, dataset_name, create_enable) {
	var result = null;
	if (create_enable && !fs.existsSync(storage_path))
		fs.mkdirSync(storage_path);
	var units_path = storage_path + "/units";
	if (create_enable && !fs.existsSync(units_path))
		fs.mkdirSync(units_path);
	var unit_path = units_path + "/" + unit;
	if (create_enable && !fs.existsSync(unit_path))
		fs.mkdirSync(unit_path);
	var section_path = storage_path + "/units/" + unit + "/" + section;
	if (create_enable && !fs.existsSync(section_path))
		fs.mkdirSync(section_path);
	var cat_path = section_path + "/" + category;
	if (create_enable && !fs.existsSync(cat_path))
		fs.mkdirSync(cat_path);
	var dataset_path = cat_path + "/" + dataset_name;
	if (!fs.existsSync(dataset_path)) {
		if (create_enable) {
			fs.mkdirSync(dataset_path);
			result = dataset_path;
		}
		else console.log("[ # ] verbose message: no dataset at "+dataset_path);
	}
	else result = dataset_path;
	return result;
}

var next_index_cache = {};

function get_next_transaction_index(unit, section, dataset_name, ymd_array, increment_after_getting_enable) {
	var dataset_path = get_dataset_path_if_exists_else_null(unit, section, "transactions", dataset_name, false);
	var result = 0;
	if (dataset_path !== null) {
		if (ymd_array && (ymd_array.length>=1) && fun.is_not_blank(ymd_array[0])) {
			var y_path = dataset_path + "/" + fun.zero_padded(ymd_array[0],4);
			if (ymd_array && (ymd_array.length>=2) && fun.is_not_blank(ymd_array[1])) {
				var m_path = y_path + "/" + fun.zero_padded(ymd_array[1],2);
				if (ymd_array && (ymd_array.length>=3) && fun.is_not_blank(ymd_array[2])) {
					var d_path = m_path + "/" + fun.zero_padded(ymd_array[2],2);
					if (d_path in next_index_cache) {
						result = next_index_cache[d_path];
						if (increment_after_getting_enable) next_index_cache[d_path]++;
					}
					else {
						item_keys = fun.getVisibleFiles(d_path);
						for (var ik_i=0, ik_len=item_keys.length; ik_i<ik_len; ik_i++) {
							var number = parseInt(fun.splitext(item_keys[ik_i])[0]);
							if (number+1>result) result = number + 1;
						}
						next_index_cache[d_path] = result;
						if (increment_after_getting_enable) next_index_cache[d_path]++;
					}
				}
				else throw "ERROR: blank day sent to get_next_transaction_index";
			}
			else throw "ERROR: blank month sent to get_next_transaction_index";
		}
		else throw "ERROR: blank year sent to get_next_transaction_index";
	}
	//else don't care--answer is 0 if no folder
	return result;
}

function get_table_entry_file(unit, section, dataset_name, number) {
	var result = null;
	var category = "tables";
	var parent_path = get_table_entry_parent_path(unit, section, dataset_name, number, false);
	if (parent_path !== null) {
		var result_key = number + ".yml";
		var entry_path = parent_path + "/" + result_key;
		if (fs.existsSync(entry_path)) {
			result = yaml.readSync(entry_path);
			result.tmp = {};
			result.tmp.date = fun.get_date_or_stated_date(this_item, number+" in get_table_entry");
			result.tmp.time = fun.get_time_or_stated_time(this_item, number+" in get_table_entry");
			result.key = result_key;
		}
		else console.log("ERROR: tried to get non-existant entry "+entry_path);
	}
	else console.log("ERROR: get_table_entry could not get_table_entry_parent_path for "+dataset_name+" "+category+" entry "+number+" in "+section);
	return result;
}//end get_table_entry_file

function get_table_entry(unit, section, dataset_name, number) {
	var result = null;
	var category = "tables";
	var error_prefix = "ERROR in get_table_entry: ";
	var result_key = number + ".yml";
	if (
		(unit in fsc) &&
		(section in fsc[unit]) &&
		(category in fsc[unit][section]) &&
		(dataset_name in fsc[unit][section][category])
	   ) {
		var million_count = Math.trunc(number/1000000);
		var million_path = dataset_path + "/" + million_count;
		var thousands_remainder = number - (1000000*million_count);
		//var thousand_path = million_path + "/" + Math.trunc(thousands_remainder/1000);
		million_count = million_count.toString();
		var thousand_count = (Math.trunc(thousands_remainder/1000)).toString();
		if (
			(million_count in fsc[unit][section][category][dataset_name]) &&
			(thousand_count in fsc[unit][section][category][dataset_name][million_count]) &&
			(result_key in fsc[unit][section][category][dataset_name][million_count][thousand_count])
		   ) {
			result = fsc[unit][section][category][dataset_name][million_count][thousand_count][result_key];
			if (!("tmp" in result)) {
				result.tmp = {};
				result.tmp.date = fun.get_date_or_stated_date(this_item, number+" in get_table_entry");
				result.tmp.time = fun.get_time_or_stated_time(this_item, number+" in get_table_entry");
				result.key = result_key;
			}
		}
		else console.log("ERROR: tried to get non-existant entry "+unit+"/"+section+"/"+category+"/"+dataset_name+"/"+result_key);
	}
	else console.log("ERROR: get_table_entry could not find dataset "+unit+"/"+section+"/"+category+"/"+dataset_name+" {entry:"+number+"}");
	return result;
}

function _set_table_cache_entry(unit, section, dataset_name, key, record) {
	var results = {};
	var category = "tables";
	var number = null;
	if (fun.is_not_blank(key)) {
		var dot_i = key.indexOf(".");
		if (dot_i >= 0) {
			var number_s = key.substring(0,dot_i);
			number = parseInt(number_s);
			if (!isNaN(number)) {
				if (fun.is_not_blank(unit)) {
					if (!(unit in fsc)) fsc[unit] = {};
					if (fun.is_not_blank(section)) {
						if (!(section in fsc[unit])) fsc[unit][section] = {};
						if (!(category in fsc[unit][section])) fsc[unit][section][category] = {};
						if (fun.is_not_blank(dataset_name)) {
							if (!(dataset_name in fsc[unit][section][category])) fsc[unit][section][category][dataset_name] = {};
							if (fun.is_not_blank(number)) {
								var million_count = Math.trunc(number/1000000);
								var thousands_remainder = number - (1000000*million_count);
								var thousand_count = (Math.trunc(thousands_remainder/1000)).toString();
								million_count = million_count.toString();
								if (!(million_count in fsc[unit][section][category][dataset_name])) fsc[unit][section][category][dataset_name][million_count] = {};
								if (!(thousand_count in fsc[unit][section][category][dataset_name][million_count])) fsc[unit][section][category][dataset_name][million_count][thousand_count] = {};
								fsc[unit][section][category][dataset_name][million_count][thousand_count][key] = record;
							}
							else results.error = "no (entry key) number specified";
						}
						else results.error = "no dataset_name specified";
					}
					else results.error = "no section specified";
				}
				else results.error = "no unit specified";
			}
			else result.error = "name portion '"+number_s+"' of key string does not look like a number, but was pushed into a table.";
		}
		else {
			result.error = "_set_table_cache_entry FAILED since filename '"+key+"' was not in <number>.<ext> format but was pushed into a table.";
		}
	}
	else results.error = "no key specified";
	return results;
}


function get_table_entry_parent_path(unit, section, dataset_name, number, create_enable) {
	var result = null;
	var dataset_path = get_dataset_path_if_exists_else_null(unit, section, "tables", dataset_name, create_enable);
	if (dataset_path!==null) {
		var million_count = Math.trunc(number/1000000);
		var million_path = dataset_path + "/" + million_count;
		if (create_enable && !fs.existsSync(million_path)) fs.mkdirSync(million_path);
		var thousands_remainder = number - (1000000*million_count);
		var thousand_path = million_path + "/" + Math.trunc(thousands_remainder/1000);
		if (!fs.existsSync(thousand_path)) {
			if (create_enable) {
				fs.mkdirSync(thousand_path);
				result = thousand_path;
			}
		}
		else {
			result = thousand_path;
		}
	}
	return result;
}

function get_table_entry_paths(unit, section, dataset_name) {
	var dataset_path = get_dataset_path_if_exists_else_null(unit, section, "tables", dataset_name, false);
	var results = [];
	if (dataset_path !== null) {
		var millions = fun.getVisibleDirectories(dataset_path);
		for (var m_i=0,m_len=millions.length; m_i<m_len; m_i++) {
			var million_path = dataset_path + "/" + millions[m_i];
			var thousands = fun.getVisibleDirectories(million_path);
			for (var t_i=0,t_len=thousands.length; t_i<t_len; t_i++) {
				var thousand_path = million_path + "/" + thousands[t_i];
				var file_names = fun.getVisibleFiles(thousand_path);
				for (var f_i=0,f_len=file_names.length; f_i<f_len; f_i++) {
					results.push(thousand_path+"/"+file_names[f_i]);
				}
			}
		}
	}
	//else don't care--none if no folder
	return results;
}

function get_table_entry_numbers(unit, section, dataset_name) {
	var dataset_path = get_dataset_path_if_exists_else_null(unit, section, "tables", dataset_name, false);
	var results = [];
	if (dataset_path !== null) {
		var millions = fun.getVisibleDirectories(dataset_path);
		//console.log("  "+millions.length+" million(s)");
		for (var m_i=0,m_len=millions.length; m_i<m_len; m_i++) {
			var million_path = dataset_path + "/" + millions[m_i];
			var thousands = fun.getVisibleDirectories(million_path);
			//console.log("    "+thousands.length+" thousand(s)");
			for (var t_i=0,t_len=thousands.length; t_i<t_len; t_i++) {
				var thousand_path = million_path + "/" + thousands[t_i];
				var file_names = fun.getVisibleFiles(thousand_path);
				//console.log("    "+file_names.length+" file(s)");
				//results = results.concat(file_names);
				for (var f_i=0,f_len=file_names.length; f_i<f_len; f_i++) {
					results.push(parseInt(fun.splitext(file_names[f_i])[0]));
				}
			}
		}
	}
	//else don't care--none if no folder
	return results;
}

function get_next_table_index(unit, section, dataset_name, increment_after_getting_enable) {
	var dataset_path = get_dataset_path_if_exists_else_null(unit, section, "tables", dataset_name, false);
	var result = 0;
	if (dataset_path !== null) {
		if (dataset_path in next_index_cache) {
			result = next_index_cache[dataset_path];
			if (increment_after_getting_enable) next_index_cache[dataset_path]++;
		}
		else {
			//item_keys = fun.getVisibleFiles(dataset_path);
			//for (var ik_i=0, ik_len=item_keys.length; ik_i<ik_len; ik_i++) {
			//	var number = parseInt(fun.splitext(item_keys[ik_i])[0]);
			//	if (number+1>result) result = number + 1;
			//}
			var millions = fun.getVisibleDirectories(dataset_path);
			for (var m_i=0,m_len=millions.length; m_i<m_len; m_i++) {
				var million_path = dataset_path + "/" + millions[m_i];
				var thousands = fun.getVisibleDirectories(million_path);
				for (var t_i=0,t_len=thousands.length; t_i<t_len; t_i++) {
					var thousand_path = million_path + "/" + thousands[t_i];
					var file_names = fun.getVisibleFiles(thousand_path);
					for (var f_i=0,f_len=file_names.length; f_i<f_len; f_i++) {
						var number = parseInt(fun.splitext(file_names[f_i])[0]);
						if (number+1>result) result = number + 1;
						//console.log(dataset_name+" number: "+number);
					}
				}
			}
			next_index_cache[dataset_path] = result;
			if (increment_after_getting_enable) next_index_cache[dataset_path]++;
		}
	}
	//else don't care--answer is 0 if no folder
	return result;
}


//returns object which only includes out_path if file was written
function push_next_transaction(unit, section, dataset_name, ymd_array, item, as_username, autofill_enable) {
	var category="transactions";
	var this_index = get_next_transaction_index(unit, section, dataset_name, ymd_array, true);
	var dataset_path = get_dataset_path_if_exists_else_null(unit, section, "transactions", dataset_name, true);
	var results = null;
	if (dataset_path !== null) {
		results = _write_record_as_is(null, unit, section, category, dataset_name, ymd_array, null, item, as_username, "create", this_index+".yml", autofill_enable);
		if (results.hasOwnProperty("error") && (results.error.indexOf("exist")>-1)) { //check for "already exists" error due to race condition in case that's possible
			console.log("WARNING: push_next_transaction had to try again since '"+results.error+"'");
			this_index = get_next_transaction_index(unit, section, dataset_name, ymd_array, true);
			results = _write_record_as_is(null, unit, section, category, dataset_name, ymd_array, null, item, as_username, "create", this_index+".yml", autofill_enable);
		}
	}
	else {
		results = {};
		results.error = "Can't get dataset path for '"+dataset_name+"' transactions in section "+section;
	}
	return results;
}

function push_next_table_entry(unit, section, dataset_name, item, as_username, autofill_enable) {
	var category="tables";
	var this_index = get_next_table_index(unit, section, dataset_name, true);
	var deepest_path = get_table_entry_parent_path(unit, section, dataset_name, this_index, true);
	var results = null;
	if (deepest_path !== null) {
		results = _write_record_as_is(null, unit, section, category, dataset_name, null, deepest_path, item, as_username, "create", parseInt(this_index)+".yml", autofill_enable);
		if (results.hasOwnProperty("error") && (results.error.indexOf("exist")>-1)) { //check for "already exists" error due to race condition in case that's possible
			console.log("WARNING: push_next_table_entry had to try again since '"+results.error+"'");
			this_index = get_next_table_index(unit, section, dataset_name, true);
			results = _write_record_as_is(null, unit, section, category, dataset_name, null, deepest_path, item, as_username, "create", parseInt(this_index)+".yml", autofill_enable);
		}
	}
	return results;
}

//Writes the record and updates the cache (you must validate the record BEFORE calling this)
//if name is null, name of .yml file will be in HHmmss format, where time is now, and hyphen and sequential digit is added if two entries are created in same second.
function _write_record_as_is(req_else_null, unit, section, category, dataset_name, date_array_else_null, deepest_dir_else_null, record, as_username, write_mode, custom_file_name_else_null, autofill_enable) {
	var results = {};
	//var category = "transactions";
	var indent = "      ";
	var local_time_zone = peek_setting(unit, "unit.local_time_zone");
	//unique values are below
	var dataset_path = get_dataset_path_if_exists_else_null(unit, section, category, dataset_name, true);
	if (dataset_path !== null) {
		//write files
		var deep_path;
		var y_dir_name;
		var m_dir_name;
		var d_dir_name;
		if (fun.is_not_blank(deepest_dir_else_null)) {
			deep_path = deepest_dir_else_null;
			console.log("[ + ]: "+deep_path);
		}
		else {
			//NOTE: only add COMPONENTS of NOW where missing from date array
			//if (date_array_else_null) {
			y_dir_name = moment().format("YYYY");
			if (date_array_else_null && date_array_else_null.length>=1) y_dir_name = fun.zero_padded(date_array_else_null[0], 4);
			var stated_date_enable = false;
			if (record.hasOwnProperty("stated_date")) stated_date_enable = true;
			if (stated_date_enable) {
				y_dir_name = record.stated_date.substring(0,4);
				if (fun.is_blank(y_dir_name)) {
					y_dir_name = moment().format("YYYY");
					console.log("ERROR: reverted to current year directory "+y_dir_name+" due to invalid stated date '"+stated_date+"'");
				}
			}
			var y_dir_path = dataset_path + "/" + y_dir_name;
			if (!fs.existsSync(y_dir_path))
				fs.mkdirSync(y_dir_path);
			m_dir_name = moment().format("MM");
			if (date_array_else_null && date_array_else_null.length>=2) m_dir_name = fun.zero_padded(date_array_else_null[1], 2);
			if (stated_date_enable) {
				m_dir_name = record.stated_date.substring(5,7);
				if (fun.is_blank(m_dir_name)) {
					m_dir_name = moment().format("MM");
					console.log("ERROR: reverted to current month directory "+m_dir_name+" due to invalid stated date '"+stated_date+"'");
				}
			}
			var m_dir_path = y_dir_path + "/" + m_dir_name;
			if (!fs.existsSync(m_dir_path))
				fs.mkdirSync(m_dir_path);
			d_dir_name = moment().format("DD");
			if (date_array_else_null && date_array_else_null.length>=3) d_dir_name = fun.zero_padded(date_array_else_null[2], 2);
			if (stated_date_enable) {
				d_dir_name = record.stated_date.substring(8,10);
				if (fun.is_blank(d_dir_name)) {
					d_dir_name = moment().format("DD");
					console.log("ERROR: reverted to current month directory "+d_dir_name+" due to invalid stated date '"+stated_date+"'");
				}
			}
			var d_dir_path = m_dir_path + "/" + d_dir_name;
			if (!fs.existsSync(d_dir_path))
				fs.mkdirSync(d_dir_path);
			deep_path = d_dir_path;
			//}
			//else {
			//	deep_path = dataset_path;
			//	results.error = "ERROR: Could not create dated path since missing date for "+JSON.stringify(record);
			//}
		}
		var out_time_string = moment().format("HHmmss");
		var auto_hyphenate_enable = false;
		if (custom_file_name_else_null === null) auto_hyphenate_enable = true;
		if (fun.is_blank(custom_file_name_else_null)) custom_file_name_else_null = out_time_string + ".yml";
		results.out_name = custom_file_name_else_null;
		var out_path = deep_path + "/" + results.out_name;
		//this callback doesn't work:
		//yaml.write(out_path, record, "utf8", show_notice);
		//NOTE: _settings[section].autofill_requires["family_id"] = ["first_name", "last_name", "grade"];
		//NOTE: autofill_cache.care.qty["J&S"] = "2";
		if (autofill_enable) autofill(unit, section, record, true);
		var finalize_enable = false;
		if (write_mode=="create") {
			if (auto_hyphenate_enable) {
				var suffix = 0;
				var file_name_no_ext = fun.splitext(results.out_name)[0];
				while (fs.existsSync(out_path)) {
					suffix += 1; //intentionally start at 1
					results.out_name = file_name_no_ext + "-" + suffix + ".yml";
					out_path = deep_path + "/" + results.out_name;
					console.log(" # trying to find new name "+out_path+"...");
				}
				finalize_enable = true;
				console.log(indent+"(PICKED NAME "+results.out_name+" at "+out_path);
			}
			else {
				if (!fs.existsSync(out_path)) {
					finalize_enable = true;
				}
				else results.error = "ERROR: nothing written for write_mode "+write_mode+" since file "+out_path+" already exists";
			}
		}
		else if (write_mode=="modify") {
			if (fs.existsSync(out_path)) {
				finalize_enable = true;
			}
			else results.error = "ERROR: Nothing written since in modify mode but file "+out_path+" does not exist.";
		}
		if (finalize_enable) {
			if ((write_mode!="create")&&(write_mode!="modify")) {
				results.error = "ERROR: Nothing written, due to unknown write_mode "+write_mode;
				console.log(results.error);
				finalize_enable = false;
			}
		}
		if (finalize_enable) {
			//region generated fields
			if (write_mode=="create") {
				if (!("time" in record)) record.time = moment().format('HH:mm:ss');
				if (!("ctime" in record)) record.ctime = moment().format('YYYY-MM-DD HH:mm:ss Z');
				if (!("tz_offset_mins" in record)) record.tz_offset_mins = moment().utcOffset();
				if (!("tz" in record)) {
					if (local_time_zone!==null) record.tz = local_time_zone;
					else console.log(indent+"ERROR: missing unit.local_time_zone during record "+write_mode);
				}
				record.created_by = as_username;
				if (req_else_null) {
					record.created_by_ip = req_else_null.ip;
					record.created_by_ips = req_else_null.ips;
					record.created_by_hostname = req_else_null.hostname;
				}
			}
			else if (write_mode=="modify") {
				if (!("modified_time" in record)) record.modified_time = moment().format('HH:mm:ss');
				if (!("mtime" in record)) record.mtime = moment().format('YYYY-MM-DD HH:mm:ss Z');
				if (risky_write_missing_tz_info_using_current_enable) {
					if (!("tz_offset_mins" in record)) record.tz_offset_mins = moment().utcOffset();
					if (!("tz" in record)) {
						if (local_time_zone!==null) record.tz = local_time_zone;
						else console.log(indent+"ERROR: missing unit.local_time_zone during record "+write_mode);
					}
				}
				if (!("modified_by" in record)) record.modified_by = as_username;
				if (req_else_null) {
					if (!("modified_by_ip" in record)) record.modified_by_ip = req_else_null.ip;
					if (!("modified_by_ips" in record)) record.modified_by_ips = req_else_null.ips;
					if (!("modified_by_hostname" in record)) record.modified_by_hostname = req_else_null.hostname;
				}
			}
			//else already checked for bad write_mode and this code won't run in that case
			//endregion generated fields


			console.log(indent+"* WRITING "+out_path);
			var byte_count = yaml.writeSync(out_path, record, "utf8");
			if (byte_count > 0) {
				results.out_path = out_path;
				console.log(indent+"  done.");
				if (category=="tables") {
					cache_results = _set_table_cache_entry(unit, section, dataset_name, key, record);
					if (cache_results.hasOwnProperty("error")) {
						results.error = "ERROR saving cache via _write_record_as_is: "+cache_results.error;
					}
				}
				else {
					if (fsc===null) fsc = {};
					if (!fsc.hasOwnProperty(unit))
						fsc[unit] = {};
					if (!fsc[unit].hasOwnProperty(section))
						fsc[unit][section] = {};
					if (!fsc[unit][section].hasOwnProperty(category))
						fsc[unit][section][category] = {};
					if (!fsc[unit][section][category].hasOwnProperty(dataset_name))
						fsc[unit][section][category][dataset_name] = {};
					var msg = "Saved entry for "+out_time_string.substring(0,2) + ":" + out_time_string.substring(2,4) + ":" + out_time_string.substring(4,6);

					if (fun.is_not_blank(y_dir_name)) {
						if (!fsc[unit][section][category][dataset_name].hasOwnProperty(y_dir_name)) {
							fsc[unit][section][category][dataset_name][y_dir_name] = {};
						}
						if (fun.is_not_blank(m_dir_name)) {
							if (!fsc[unit][section][category][dataset_name][y_dir_name].hasOwnProperty(m_dir_name)) {
								fsc[unit][section][category][dataset_name][y_dir_name][m_dir_name] = {};
							}
							if (fun.is_not_blank(d_dir_name)) {
								if (!fsc[unit][section][category][dataset_name][y_dir_name][m_dir_name].hasOwnProperty(d_dir_name)) {
									fsc[unit][section][category][dataset_name][y_dir_name][m_dir_name][d_dir_name] = {};
								}
								if (fs.statSync(results.out_path).isFile()) {
									fsc[unit][section][category][dataset_name][y_dir_name][m_dir_name][d_dir_name][results.out_name] = record;
								}
							}
						}
					}
					else msg = "ERROR: could not cache since table format "+category+" is not implemented in _write_record_as_is";
					results.notice = msg;
					//if (record.stated_time) results.notice += " (stated time " + record.stated_time + ")";
				}
			}
			else {
				console.log(indent+"  FAILED to save "+out_path);
				results.error = "ERROR: 0 bytes written to " + out_path;
			}
		}
	}
	else {
		results.error="ERROR: could not create table path";
	}
	return results;
}//end _write_record_as_is

var ias_msg_stack = [];
function is_after_school(unit, section, this_time) {
	if (!fun.is_blank(this_time)) {
		if (!section) console.log("ERROR: no section given to is_after_school");
		if (has_setting(unit, section+".local_end_time")) {
			var local_time_zone = null;
			if (has_setting(unit, "unit.local_time_zone")) local_time_zone = peek_setting(unit, "unit.local_time_zone");
			//if (Date.format("HH:mm:ss") > Date.parse("15:05:00"))
			var local_now = moment(this_time);
			//console.log("Using timezone "+local_time_zone);
			if (local_time_zone!==null) local_now = moment.tz(this_time, local_time_zone); // NOT moment().tz see http://momentjs.com/timezone/docs/#/data-loading
			else console.log("ERROR: missing unit.local_time_zone setting during is_after_school");
			//old way (doesn't work for some reason--can't find current timezone from os) local_now.local();
			var now_date_string = local_now.format("YYYY-MM-DD");
			var currentTimeString = local_now.format("HH:mm:ss");  // moment('11:00p', "HH:mm a");
			var tmp_local_end_date = now_date_string+" "+peek_setting(unit, section+".local_end_time");
			//console.log("tmp_local_end_date:"+tmp_local_end_date);
			var endTime = moment(tmp_local_end_date); //, "HH:mm:ss"; // var endTime = moment(_settings[section].local_end_time, "HH:mm:ss");
			var endTimeString = endTime.format("HH:mm:ss");
			//console.log("UTC Offset (minutes): "+local_now.utcOffset());
			//console.log("Z: "+local_now.format("Z"));  for example, in EST, outputs -4:00 during Eastern Daylight Time, -5:00 the rest of the year
			//if (!endTime.isAfter(local_now)) {
			var msg;
			if (currentTimeString >= endTimeString) {
				//msg = "is_after_school " + currentTimeString + ":y (>= " + endTimeString + ")";
				//if (!fun.array_contains(ias_msg_stack, msg)) {
				//	console.log(msg);
				//	ias_msg_stack.push(msg);
				//}
				return true;
			}
			else {
				//msg = "is_after_school " + currentTimeString + ":n (<  " + endTimeString + ")";
				//if (!fun.array_contains(ias_msg_stack, msg)) {
				//	console.log(msg);
				//	ias_msg_stack.push(msg);
				//}
				return false;
			}
		}
		else {
			console.log("WARNING: missing "+section+".local_end_time");
			return false;
		}
	}
	else {
		console.log("ERROR: no time given to is_after_school");
		return null;
	}
}

function is_before_school(unit, section, this_time) {
	if (!fun.is_blank(this_time)) {
		if (!section) console.log("ERROR: no section given to is_before_school");
		if (has_setting(unit, section+".local_start_time")) {
			var local_time_zone = null;
			if (has_setting(unit, "unit.local_time_zone")) local_time_zone = peek_setting(unit, "unit.local_time_zone");
			else console.log("ERROR: missing unit.local_time_zone setting during is_before_school");
			//if (Date.format("HH:mm:ss") > Date.parse("15:05:00"))
			var local_now = moment(this_time);
			if (local_time_zone!==null) local_now = moment.tz(this_time, local_time_zone); //NOT moment().tz see http://momentjs.com/timezone/docs/#/data-loading
			else console.log("ERROR: missing unit.local_time_zone setting");
			var now_date_string = local_now.format("YYYY-MM-DD");
			var currentTimeString = local_now.format("HH:mm:ss");  // moment('11:00p', "HH:mm a");
			var tmp_local_start_date = now_date_string+" "+peek_setting(unit, section+".local_start_time");
			//console.log("tmp_local_start_date:"+tmp_local_start_date);
			var startTime = moment(tmp_local_start_date); //, "HH:mm:ss" // var endTime = moment(_settings[section].local_end_time, "HH:mm:ss");
			var startTimeString = startTime.format("HH:mm:ss");

			//if (startTime.isAfter(local_now)) {
			if (currentTimeString < startTimeString) {
				//msg = "is_before_school " + currentTimeString + ":y (<  " + endTimeString + ")";
				//if (!fun.array_contains(ias_msg_stack, msg)) {
				//	console.log(msg);
				//	ias_msg_stack.push(msg);
				//}
				return true;
			}
			else {
				//msg = "is_before_school " + currentTimeString + ":n (>= " + endTimeString + ")";
				//if (!fun.array_contains(ias_msg_stack, msg)) {
				//	console.log(msg);
				//	ias_msg_stack.push(msg);
				//}
				return false;
			}
		}
		else {
			console.log("WARNING: missing "+section+".local_end_time");
			return false;
		}
	}
	else {
		console.log("ERROR: no time given to is_before_school");
		return null;
	}
}

function get_billing_cycle_selector(unit, section, category, dataset_name, selected_year, selected_month, selected_day, selected_number) {
	var category="tables";
	var ret = "";
	ret += "<h4>Billing Cycles</h4><br/>"+"\n";
	//var category = "tables"; now is a param
	//var dataset_name = "BillingCycle"; now is a param
	//var results = push_next_table_entry(unit, section, dataset_name, item, req.user.username, false);
	//cycle_paths = get_table_entry_paths(unit, section, "BillingCycle");
	var cycle_entry_numbers = get_table_entry_numbers(unit, section, dataset_name);
	//ret += get_table_entry_buttons(config.proxy_prefix_then_slash, "get", section, "BillingCycle", "selected_item_key", "=primary_key()");
	if (cycle_entry_numbers) {
		ret += "Found "+cycle_entry_numbers.length+" billing cycle(s).<br/>"+"\n";
		ret += "Click to generate report:<br/>"+"\n";
		var cen_entry;
		var cen_name;
		for (var cen_i=0,cen_len=cycle_entry_numbers.length; cen_i<cen_len; cen_i++) {
			cen_entry = null;
			cen_name = "";
			//console.log("  cycle entry number index: "+cen_i);
			var cen = cycle_entry_numbers[cen_i];
			//console.log("  cycle entry number from filename: "+cen);
			if (cen!=selected_number) ret += '<a href="'+config.proxy_prefix_then_slash+'?'+
				'unit='+unit+
				'&section='+section+
				'&category=transactions'+ //NOTE: specify transactions since value of category variable is "tables" now since showing the BillingCycle table
				'&selected_year='+selected_year+
				'&selected_month=(none)'+
				'&selected_day=(none)'+
				'&selected_number='+cen+
				'#results">';


			cen_entry = get_table_entry(unit, section, dataset_name, cen);
			//console.log("    got: "+JSON.stringify(cen_entry));
			//if (cen==selected_number) {
			if (cen_entry && fun.is_not_blank(cen_entry.cycle_name)) cen_name = cen_entry.cycle_name;
			//}
			ret += cen + ": " + cen_name;
			if (cen!=selected_number) ret += '</a>';
			ret += "<br/>";
			/*
			ret += '<form action="'+config.proxy_prefix_then_slash+'" method="get">';
			ret += '  <input type="hidden" name="unit" id="unit" value="'+unit+'"/>' + "\n";
			ret += '  <input type="hidden" name="section" id="section" value="'+section+'"/>' + "\n";
			ret += '  <input type="hidden" name="category" id="category" value="'+category+'"/>' + "\n";
			ret += '  <input type="hidden" name="dataset_name" id="dataset_name" value="'+dataset_name+'"/>' + "\n";
			ret += '<input type="hidden" name="selected_year" id="selected_year" value="'+selected_year+'" />';
			ret += '<input type="hidden" name="selected_month" id="selected_month" value="(none)" />';
			ret += '<input type="hidden" name="selected_day" id="selected_day" value="(none)" />';
			ret += '<input type="hidden" name="selected_number" id="selected_number" value="'+cen+'" />';
			if (cen!=selected_number) {
				var cen_entry = get_table_entry(unit, section, dataset_name, selected_number);
				var cen_name = "";
				if (cen_entry && fun.is_not_blank(cen_entry.cycle_name)) cen_name = cen_entry.cycle_name;
				ret += '<button class="btn" type="submit">'+cen+": "+cen_name+'</button>';
			}
			else {
				ret += '<button class="btn btn-default" type="submit">'+cen+'</button>';
			}
			ret += '</form>';
			*/
		}
		cen_name = null;  // out of loop
		cen_entry = null;  // out of loop
		if (fun.is_not_blank(selected_number)) {

			if ((typeof selected_number)=="string") selected_number = parseInt(selected_number);
			//var s_sub_path = get_table_entry_parent_path(unit, section, dataset_name, selected_number, false);
			//if (s_sub_path!=null) {
				//var s_entry_path = s_sub_path + "/" + selected_number + ".yml";
			cen_entry = get_table_entry(unit, section, dataset_name, selected_number);
			if (cen_entry && fun.is_not_blank(cen_entry.cycle_name)) cen_name = cen_entry.cycle_name;
			if (cen_entry) {
				ret += "<br/>"+"\n";
				ret += "<br/>"+"\n";
				ret += '<a name="results"></a>' + "\n";
				ret += '(other billing cycle names appear above)';
				if (cen_name===null) ret += "<h4>Invoices for Billing Cycle "+selected_number+"</h4><br/>"+"\n";
				else ret += "<h4>Invoices for "+cen_name+"</h4>"+"\n";
				var billable_items = [];
				ret += "with end dates: ";
				if ("end_dates" in cen_entry) {
					ret += "<ul>\n";
					for (var ed_i=0,ed_len=cen_entry.end_dates.length; ed_i<ed_len; ed_i++) {
						ret += "<li>"+cen_entry.end_dates[ed_i] + "</li>\n";
					}
					ret += "</ul>\n";
				}
				ret += "<br/>\n";
			}
			else console.log("ERROR: invalid selected entry "+selected_number);
			//}
			//else console.log("ERROR: Could not get entry parent path, probably due to invalid selected entry "+selected_number);
		}
	}
	else ret += '(No billing cycles were created yet.)';
	return ret;
}

// Configure express to use handlebars templates
var hbs = exphbs.create({
		helpers: {
		remove_audio_message: function() {
			//delete session.runme;
			//not a function: session.destroy("runme");
		},
		sayHello: function () { alert("Hello"); },
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
		if_is_any_form_mode: function(unit, mode, opts) {
			//console.log("* checking if_eq while user is " + a);
			var is_match = false;
			var arr = ["create", "modify"];
			//if (Array.isArray(arr)) {
			for (var i=0, len=arr.length; i<len; i++) {
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
		show_settings: function(unit, section, username, selected_setting, opts) {
			var ret = "";

			if (user_has_section_permission(unit, username, section, "settings")) {
				var settings_keys = get_all_settings_names();
				ret += '<div><a href="'+config.proxy_prefix_then_slash+"reload-settings?section="+section+'" class="btn btn-danger" role="button">' + "\n";
				ret += 'Wipe and Reload Settings';
				ret += '</a></div>' + "\n";
				ret += '<div><a href="'+config.proxy_prefix_then_slash+"reload-permissions-and-groups?section="+section+'" class="btn btn-danger" role="button">' + "\n";
				ret += 'Wipe and Reload Permissions and Groups';
				ret += '</a></div>' + "\n";
				ret += '<br/>' + "\n";
				for (var i=0, len=settings_keys.length; i<len; i++) {
					if (settings_keys[i]!=selected_setting) ret += '<a href="'+config.proxy_prefix_then_slash+"?selected_setting="+settings_keys[i]+'">'+settings_keys[i]+"</a><br/>";
					else {
						ret += '<table>' + "\n";
						ret += '<tbody>' + "\n";
						ret += '<tr>' + "\n";
						ret += '<td>'+settings_keys[i]+"&nbsp;=&nbsp;"+"\n";
						ret += '</td>' + "\n";
						ret += '<td>' + "\n";
						ret += '<form id="change-section-settings" action="' + config.proxy_prefix_then_slash + 'poke-settings" method="post">' + "\n";
						//ret += '<div class="form-group row">';
						ret += '  <input type="hidden" name="unit" id="unit" value="'+unit+'"/>' + "\n";
						ret += '  <input type="hidden" name="section" id="section" value="'+section+'"/>' + "\n";
						//ret += '  <input type="hidden" name="category" id="category" value="'+category+'"/>' + "\n";
						//ret += '  <input type="hidden" name="dataset_name" id="dataset_name" value="'+dataset_name+'"/>' + "\n";
						ret += '  <input type="hidden" name="mode" id="mode" value="settings"/>' + "\n";
						ret += '  <input type="hidden" name="selected_setting" id="selected_setting" value="'+selected_setting+'"/>' + "\n";
						//ret += '  <label for="selected_setting_value" class="col-sm-2 col-form-label">'+settings_keys[i]+'&nbsp;=&nbsp;</label>' + "\n";

						//ret += '    <div class="col-sm-10">' + "\n";
						ret += '  <div class="input-group">' + "\n";
						ret += '      <input type="text" class="form-control" size="8" name="selected_setting_value" id="selected_setting_value" value="'+peek_setting(unit, selected_setting)+'"/>' + "\n";
						//ret += '    </div>' + "\n";
						ret += '    <div class="input-group-btn">' + "\n";
						ret += '      <button class="btn btn-default" type="submit">Save</button>' + "\n";
						ret += '    </div>' + "\n";
						ret += '  </div>' + "\n";
						//ret += '</div>' + "\n";
						ret += '</form>' + "\n";
						ret += '</td>' + "\n";
						ret += '</tr>' + "\n";
						ret += '</tbody>' + "\n";
						ret += '</table>' + "\n";
					}
				}
			}
			else {
				ret += 'You do not have permission to access this section';
			}
			return new Handlebars.SafeString(ret);
		},
		show_billing_cycle_preview: function(unit, section, username, selected_number, opts) { //as opposed to having a billing-cycle route
			var ret = "";
			var mode = "reports";
			var category = "tables"; //BillingCycle
			var dataset_name = "BillingCycle";
			var warnings = ""; // show at end after completed successfully
			var groupby = null;
			if (user_has_section_permission(unit, username, section, mode)) {
				if (fun.is_not_blank(selected_number)) {
					if (has_setting(unit, section+".default_groupby")) groupby = peek_setting(unit, section+".default_groupby");
					if (fun.is_not_blank(groupby)) {
						var this_rate = 0.0;
						if ( has_setting(unit, section+".extended_hours_hourly_price") ) {
							this_rate = peek_setting(unit, section+".extended_hours_hourly_price");
						}
						if (this_rate<=0.00001) {
							warnings += '<div class="alert alert-warning">Hourly rate is '+this_rate+'</div>';
						}
						cen_entry = get_table_entry(unit, section, dataset_name, selected_number);
						var section_friendly_name = section;
						var error="";
						if (has_setting(unit, section + ".display_name")) section_friendly_name = peek_setting(unit, section + ".display_name");
						else section_friendly_name = section.charAt(0).toUpperCase() + section.slice(1);
						var bill_dow = 5; //1 is monday, 5 is friday
						var bill_source_msg = "";
						if (has_setting(unit, section+".bill_iso_day_of_week")) {
							bill_dow = parseInt(peek_setting(unit, section+".bill_iso_day_of_week"));
							bill_source_msg = " from settings";
						}
						if (bill_dow>=1 & bill_dow<=7) {
						}
						else error+="Day of week for billing ("+section+".bill_iso_day_of_week) is configured incorrectly as "+bill_dow+bill_source_msg+" (should be 1-7, where 1 is Monday). ";

						if (cen_entry && cen_entry.end_dates && fun.is_blank(error)) {
							var key_totals_by_end_date = {};
							var unused_items = [];
							var dataset_path = get_dataset_path_if_exists_else_null(unit, section, category, "student", false); //NOT BillingCycle category--this is data
							//if (dataset_path===null) ret+='<div class="alert alert-warning">missing dataset path '+dataset_path+'</div>';
							//else ret+='<div class="alert alert-success">using table path '+dataset_path+'</div>';
							//ret += "weeks ending on: \n";
							//ret += "<ul>\n";
							var data_by_group = {};
							var primary_key_components = null;
							if (has_setting(unit, section+".autofill_requires."+groupby)) {
								primary_key_components = peek_setting(unit, section+".autofill_requires."+groupby);
							}
							var ymd_array;
							var sff_i;
							var sff_len;
							var ed_i;
							var ed_len;
							for (ed_i=0,ed_len=cen_entry.end_dates.length; ed_i<ed_len; ed_i++) {
								//Backstep since billing cycle only specifies end dates (last day of week)
								ymd_array = cen_entry.end_dates[ed_i].split("-");
								error = "";
								if (ymd_array.length!=3) error = "ERROR: date should have 3 numbers separated by hyphens like YYYY-MM-DD but is "+cen_entry.end_dates[ed_i]+" in entry "+cen_entry.key+" in "+section+" "+mode+" table "+category;
								if (fun.is_blank(error)) {
									//ret += "<li>"+cen_entry.end_dates[ed_i]+"</li>\n";
									var selected_year = ymd_array[0];
									var selected_month = ymd_array[1];
									var selected_day = ymd_array[2];
									var y_i = parseInt(selected_year);
									var m_i = parseInt(selected_month);
									var d_i = parseInt(selected_day);
									var y_s = fun.zero_padded(selected_year, 2);
									var m_s = fun.zero_padded(selected_month, 2);
									var d_s = fun.zero_padded(selected_day, 2);
									var folder_date_s = moment(selected_year+"-"+m_s+"-"+d_s);
									var this_dow = folder_date_s.day(); //where 1 is monday and 5 is friday
									//if (this_dow==bill_dow) {
									//ret += "bill on "+folder_date_s.format('dddd')+' '+folder_date_s.format("dddd MMM D, Y")+' for:<br/>' + "\n";//debug only
									var used_days_count = 0;
									for (var d_backstep=0; d_backstep<7; d_backstep++) {
										var back_dow_i = this_dow-d_backstep;
										if (back_dow_i<=0) back_dow_i += 7;
										var back_d_i = d_i-d_backstep;
										var back_m_i = m_i;
										var back_y_i = y_i;
										var back_dim = folder_date_s.daysInMonth();
										var back_y_s = fun.zero_padded(back_y_i, 4); //does convert to string
										var back_m_s = fun.zero_padded(back_m_i, 2);
										if (back_d_i<=0) {
											//example: 2016-01-01 is a Friday, so to bill for Mon-Fri, go back a year (for only dow 1-4 aka Mon-Thurs)
											back_m_i = m_i - 1;
											if (back_m_i<=0) {
												back_y_i = y_i - 1;
												back_y_s = fun.zero_padded(back_y_i, 4);
												back_m_i = 12;
											}
											back_m_s = fun.zero_padded(back_m_i, 2);
											back_dim = moment(back_y_i+"-"+back_m_s, "YYYY-MM").daysInMonth();
											back_d_i += back_dim; //add since back_d_i is negative in this case
										}
										var back_d_s = fun.zero_padded(back_d_i, 2);
										var back_d_path = dataset_path + "/" + back_y_s + "/" + back_m_s + "/" + back_d_s;
										var back_date_s = back_y_s+"-"+back_m_s+"-"+back_d_s;
										var back_date = moment(back_date_s, "YYYY-MM-DD");

										//NOTE: back_d_path could be same as before, if is friday (if d_backstep is 0)
										if (fsc[unit][section].transactions.hasOwnProperty(back_y_s) &&
										    fsc[unit][section].transactions[back_y_s].hasOwnProperty(back_m_s) &&
										    fsc[unit][section].transactions[back_y_s][back_m_s].hasOwnProperty(back_d_s)
										   ) {  // if (fs.existsSync(back_d_path)) {
											//ret += '* '+back_date.format("dddd MMM D, Y")+'<br/>' + "\n";//debug only
											//var item_keys = fun.getVisibleFiles(back_d_path);
											//for (var ik_i=0,ik_len=item_keys.length; ik_i<ik_len; ik_i++) {
											for (item_key in fsc[unit][section].transactions[back_y_s][back_m_s][back_d_s]) {
												//var item_key = item_keys[ik_i];
												var item_path = back_d_path + "/" + item_key;
												if (fsc[unit][section].transactions[back_y_s][back_m_s][back_d_s].hasOwnProperty("item_key")) {
												//if (item_key.endsWith(".yml")) {
													//var this_item = yaml.readSync(item_path, "utf8");
													//this_item.tmp = {};
													var this_item = fsc[unit][section].transactions[back_y_s][back_m_s][back_d_s][item_key];
													//if ("stated_time" in this_item) this_item.tmp.time = this_item.stated_time;
													//else if ("time" in this_item) this_item.tmp.time = this_item.time;
													//else {
													if (fun.is_blank(this_item.tmp.time)) {
														console.log("[   ] CACHING time for "+item_path+" in backstep for billing cycle");
														this_item.tmp.time = fun.get_time_or_stated_time(this_item, "backstep for billing cycle week end date");
														if (this_item.tmp.time===null) {
															var name_as_time = fun.splitext(item_key)[0];
															if (name_as_time.length>=6) {
																this_item.tmp.time = item_key.substring(0,2)+":"+item_key.substring(0,4)+":"+item_key.substring(4,6);
																console.log("      as " + this_item.tmp.time);  // debug only
															}
															else {
																console.log("      FAILED");
																warnings += '<div class="alert alert-warning">cannot derive time for '+item_path+'</div>'+"\n";
															}
														}
														else {
															console.log("      OK (was already cached)");  // debug only
														}
													}
													else console.log("[   ] CACHING time for "+item_path+" in backstep for billing cycle...OK (already done)");
													if (fun.is_blank(this_item.tmp.date)) {
														console.log("[   ] CACHING date for "+item_path+" in backstep for billing cycle");
														this_item.tmp.date = fun.get_date_or_stated_date(this_item, item_key+" in show_billing_cycle_preview helper for year view");
														if (this_item.tmp.date===null) {
															this_item.tmp.date = back_y_s+"-"+back_m_s+"-"+back_d_s;
															console.log('(verbose message) missing date so using folder named by date for '+item_path);
														}
													}
													if (this_item) {
														this_item.key = item_key;
														this_item.tmp["=get_date_from_path()"] = back_date_s;
														if (!this_item.tmp.hasOwnProperty("=get_origin_date()")) {
															if (this_item.hasOwnProperty("date"))
																this_item.tmp["=get_origin_date()"] = this_item.date;
															else if (this_item.hasOwnProperty("ctime"))
																this_item.tmp["=get_origin_date()"] = this_item.ctime.substring(0,10);
															else {
																var this_item_path = back_d_path+"/"+item_key;
																var stats = fs.statSync(this_item_path);
																//var ctime = null;
																if (stats.hasOwnProperty("ctime")) {
																	this_item.tmp["=get_origin_date()"] = stats.ctime;
																	console.log("(debug only in show_billing_cycle_preview) CACHED '=get_origin_date()' from stats.ctime for "+this_item_path);
																}
																else console.log("MISSING ctime from stats for "+this_item_path);
																//see Oleg Mikhailov on https://stackoverflow.com/questions/7559555/last-modified-file-date-in-node-js edited May 12 '16 answered May 11, '16
																//else if (stats.hasOwnProperty("mtime")) this_item.tmp["=get_origin_date()"] = stats['mtime'];
																//ctime = new Date(util.inspect(stats.mtime));
																//TODO: why doesn't this work (util not defined [even though installed via npm and required at top of file]): var mtime = new Date(util.inspect(stats.mtime));
																//NOTE: this intentionally shows a full timestamp to indicate there was a problem getting the date via normal means:
																//if (ctime!==null) this_item.tmp["=get_origin_date()"] = ctime;
															}
														}
														if (!this_item.hasOwnProperty("active") || fun.is_true(this_item.active)) {
															if (fun.is_not_blank(this_item[groupby])) {
																this_item[groupby] = this_item[groupby].trim();
																if (!this_item[groupby].startsWith("-")) {
																	//ok to proceed since fun.is_not_blank DOES check length>0 AFTER trim
																	if (!(this_item[groupby] in data_by_group)) data_by_group[this_item[groupby]] = {};


																	span_info = get_care_time_info(this_item, unit, section);
																	if (span_info.hasOwnProperty("error")) {
																		warnings += '<div class="alert alert-warning">'+span_info.error+' in '+item_path+'</div>';
																	}
																	if (span_info.hasOwnProperty("seconds")) {

																		if ((typeof span_info.seconds)=="string") span_info.seconds = parseInt(span_info.seconds);
																		var qty_times_seconds = span_info.seconds;
																		if ("qty" in this_item) {
																			qty_times_seconds *= parseInt(this_item.qty);  //ok since there only is a number type (no truncation will occur)
																			if (span_info.seconds>0) {
																				if (qty_times_seconds < span_info.seconds) {
																					console.log("WARNING: " + span_info.seconds + " sec times qty " + this_item.qty + " (parsed as '"+parseInt(this_item.qty)+"') was lower than "+span_info.seconds+", so reverted to non-qty value!");
																					qty_times_seconds = span_info.seconds;
																				}
																				else {
																					//console.log("[ ] verbose message: qty_times_seconds is "+qty_times_seconds);
																					span_info.info = "NOTE: includes count for multiple names";
																				}
																			}
																		}
																		this_item.tmp["=caretime()"] = qty_times_seconds;
																		this_item.tmp["=caretime_m()"] = qty_times_seconds/60.0;
																		this_item.tmp["=caretime_h()"] = qty_times_seconds/60.0/60.0; //NOTE: toFixed returns a STRING .toFixed(3);
																		this_item.tmp["=careprice()"] = this_item.tmp["=caretime_h()"] * this_rate; //.toFixed(2);
																		if (span_info.hasOwnProperty("warning")) warnings += '<div class="alert alert-info">' + span_info.info + " in " + item_path + '</div>';
																	}
																	else {
																		this_item.tmp["=caretime()"] = 0.00;
																		this_item.tmp["=caretime_m()"] = 0.00;
																		this_item.tmp["=caretime_h()"] = 0.00;
																		this_item.tmp["=careprice()"] = 0.00;
																	}

																	span_info["=caretime()"] = this_item.tmp["=caretime()"];
																	span_info["=caretime_m()"] = this_item.tmp["=caretime_m()"];
																	span_info["=caretime_h()"] = this_item.tmp["=caretime_h()"];
																	span_info["=careprice()"] = this_item.tmp["=careprice()"];
																	var old_amount = 0.0;
																	//var this_careprice = this_item.tmp["=careprice()"];
																	if (!(cen_entry.end_dates[ed_i] in key_totals_by_end_date)) key_totals_by_end_date[cen_entry.end_dates[ed_i]] = {};
																	if (!(this_item[groupby] in key_totals_by_end_date[cen_entry.end_dates[ed_i]])) key_totals_by_end_date[cen_entry.end_dates[ed_i]][this_item[groupby]] = fun.single_level_copy(span_info);
																	else {
																		//old_amount = key_totals_by_end_date[cen_entry.end_dates[ed_i]][this_item[groupby]].tmp["=careprice()"];
																		key_totals_by_end_date[cen_entry.end_dates[ed_i]][this_item[groupby]]["=caretime()"] += span_info["=caretime()"];
																		key_totals_by_end_date[cen_entry.end_dates[ed_i]][this_item[groupby]]["=caretime_m()"] += span_info["=caretime_m()"];
																		key_totals_by_end_date[cen_entry.end_dates[ed_i]][this_item[groupby]]["=caretime_h()"] += span_info["=caretime_h()"];
																		key_totals_by_end_date[cen_entry.end_dates[ed_i]][this_item[groupby]]["=careprice()"] += span_info["=careprice()"];
																		//console.log(this_item[groupby]+"  "+span_info["=caretime_h()"].toFixed(3)+"hrs: "+old_amount.toFixed(2) + " + " + span_info["=careprice()"].toFixed(2) + " = " + data_by_group[this_item[groupby]]["=careprice()"].toFixed(2));
																	}
																	old_amount = 0.0;

																	if (!("=careprice()" in data_by_group[this_item[groupby]])) data_by_group[this_item[groupby]]["=careprice()"] = span_info["=careprice()"];
																	else {
																		old_amount = data_by_group[this_item[groupby]]["=careprice()"];
																		data_by_group[this_item[groupby]]["=careprice()"] += span_info["=careprice()"];
																		//console.log(this_item[groupby]+"  "+span_info["=caretime_h()"].toFixed(3)+"hrs: "+old_amount.toFixed(2) + " + " + span_info["=careprice()"].toFixed(2) + " = " + data_by_group[this_item[groupby]]["=careprice()"].toFixed(2));
																	}



																	if (!("identifiers" in data_by_group[this_item[groupby]])) data_by_group[this_item[groupby]].identifiers = [];
																	var combined_primary_key=null;
																	if (primary_key_components!==null) {
																		for (pkc_i=0,pkc_len=primary_key_components.length; pkc_i<pkc_len; pkc_i++) {
																			var component_val = "";
																			if (primary_key_components[pkc_i] in this_item) component_val = this_item[primary_key_components[pkc_i]].toLowerCase();
																			combined_primary_key = ((combined_primary_key===null) ? (component_val) : (combined_primary_key+"+"+component_val));
																		}
																	}
																	if (fun.is_not_blank(combined_primary_key)) {
																		if (!fun.array_contains(data_by_group[this_item[groupby]].identifiers, combined_primary_key))
																			data_by_group[this_item[groupby]].identifiers.push(combined_primary_key);
																	}
																}
																else {
																	if (((typeof this_item[groupby])=="string") && (this_item[groupby].length>2)) warnings+='<div class="alert alert-info">skipped negative value in '+JSON.stringify(this_item)+'</div>';
																}
															}
															else unused_items.push(this_item);
														}
														//else console.log("[ ] verbose message: skipped inactive entry "+JSON.stringify(this_item));
													}
													else warnings+='<div class="alert alert-warning">no data for '+item_path+'</div>';
												}
												else console.log("Skipped "+item_path+": non-YAML extension");
											}
											used_days_count++;
										}
										else {
											//ret += '* <span style="color:gray">'+back_date.format("dddd MMM D, Y")+'</span><br/>' + "\n";//debug only
										}
									}
									if (used_days_count>0) {
										//ret += '      <div class="form-check">' + "\n";
										//ret += '        <label class="form-check-label">' + "\n";
										//ret += '          <input type="checkbox" class="form-check-input" name="form_bill_for_'+folder_date_s.format("YYYYMMDD")+'">' + "\n"; //returns 'on' or 'off'
										//ret += '          '+folder_date_s.format('dddd')+' '+folder_date_s.format("MMM D, Y")+'<br/>' + "\n";
										//ret += '        </label>' + "\n";
										//ret += '      </div>' + "\n";
									}
									//}//end if bill_dow
								}
								else {
									ret += '  <div class="row"><!--report group row-->' + "\n";
									ret += '    <div class="col-sm-10">' + "\n";
									if (fun.is_not_blank(error)) ret += '<div class="alert alert-warning">'+error+"</div>"+"\n";
									ret += '    </div><!--end col-sm-10-->' + "\n";
									ret += '  </div><!--end report group row-->' + "\n";
								}//TODO: why was unused_items pasted here (unfinished code??)
							}
							ed_i = null; //out of loop, wait for next
							ed_len = null; //out of loop, wait for next
							ymd_array = null; //out of loop, wait for next
							//ret += "</ul>\n";
							for (var group_key in data_by_group) {
								var group = data_by_group[group_key];
								//ret += '<div style="page-break-before: always"> </div>' + "\n";
								//ret += "You should save this report for your records, such as by printing or print to PDF (Ctrl P). Each "+groupby+" will print on a separate page.";
								//ret += '<form class="form" id="download-billing-cycle-report" action="' + config.proxy_prefix_then_slash + 'download-billing-cycle-report">' + "\n";
								//ret += '  <input type="hidden" name="unit" id="unit" value="'+unit+'"/>' + "\n";
								//ret += '  <input type="hidden" name="section" id="section" value="'+section+'"/>' + "\n";
								//ret += '  <input type="hidden" name="category" id="category" value="'+category+'"/>' + "\n";
								//ret += '  <input type="hidden" name="dataset_name" id="dataset_name" value="'+dataset_name+'"/>' + "\n";
								//ret += '    <input type="hidden" name="mode" id="mode" value="'+mode+'"/>' + "\n";
								//ret += '    <input type="hidden" name="selected_year" id="selected_year" value="'+selected_year+'"/>' + "\n";
								//ret += '    <input type="hidden" name="selected_month" id="selected_month" value="(none)"/>' + "\n";
								//ret += '    <input type="hidden" name="selected_day" id="selected_day" value="(none)"/>' + "\n";
								//ret += '    <input type="hidden" name="selected_number" id="selected_number" value="'+selected_number+'"/>' + "\n";
								//TODO: download button and form and route for it
								//ret += '</form>' + "\n";
								ret += '  <div class="row" style="page-break-before: always">';
								ret += '    <div class="col-sm-10">';
								ret += '<h2 align="center">' + "\n";
								ret += section_friendly_name + " Invoice"; //such as Extended Care Invoice (using friendly name for care section)
								ret += '</h2><br/>' + "\n";
								ret += '    </div>';
								ret += '  </div>';
								ret += '  <div class="row">';
								ret += '    <div class="col-sm-4">';
								ret += groupby+': '+group_key+"\n";
								ret += '<div id="weeks-ending-on">';
								ret += 'weeks ending on:' + "\n";
								ret += "<ul>\n";
								for (ed_i=0,ed_len=cen_entry.end_dates.length; ed_i<ed_len; ed_i++) {
									ymd_array = cen_entry.end_dates[ed_i].split("-");
									error = "";
									if (ymd_array.length!=3) error = "ERROR: date should have 3 numbers separated by hyphens like YYYY-MM-DD but is "+cen_entry.end_dates[ed_i]+" in entry "+cen_entry.key+" in "+section+" "+mode+" table "+category;
									if (fun.is_blank(error)) {
										ret += "<li>"+cen_entry.end_dates[ed_i];
										if ((cen_entry.end_dates[ed_i] in key_totals_by_end_date) && (group_key in key_totals_by_end_date[cen_entry.end_dates[ed_i]])) {
											var combined_span_info = key_totals_by_end_date[cen_entry.end_dates[ed_i]][group_key];
											if ("=caretime_h()" in combined_span_info) {
												ret += ": " + combined_span_info["=caretime_h()"].toFixed(3) + " hrs ";
											}
											if ("=careprice()" in combined_span_info) ret += " = $" + combined_span_info["=careprice()"].toFixed(2) + " ";
											if ("info" in combined_span_info) ret += " (" + combined_span_info.info + ")";
										}
										ret += "</li>\n";
									}
								}
								ret += "</ul>\n";
								ret += '</div>';
								ret += "<br/>\n";
								ret += "<br/>\n";
								if ("identifiers" in group) {
									ret += 'Recorded as:' + "\n";
									ret += "<ul>\n";
									for (var i_i=0,i_len=group.identifiers.length; i_i<i_len; i_i++) {
										ret += "<li>"+fun.split_capitalized(group.identifiers[i_i], "+").join(" ")+"</li>\n";
										//ret += "<li>"+group.identifiers[i_i]+"</li>";
									}
									ret += "</ul>\n";
								}
								ret += '    </div>' + "\n";
								ret += '    <div class="col-sm-6">' + "\n";
								ret += '      TOTAL: '+group["=careprice()"].toFixed(2)+"\n";
								ret += '    </div>' + "\n";
								ret += '  </div>' + "\n";
							}

							ret += '  <div class="row" style="page-break-before: always">';
							ret += '    <div class="col-sm-10">';
							ret += '      <h3>Remaining Issues:</h3>';
							ret += '    </div>';
							ret += '  </div>';

							if (fun.is_not_blank(warnings)) ret += warnings;
							ret += '<h4>Uncategorized Items Not Billed:</h4>';
							var ui_i;
							var ui_len;
							if (has_setting(unit, section+".sheet_fields")) {
								var section_sheet_fields = peek_setting(unit, section+".sheet_fields");
								if (unused_items.length>0) {
									ret += '<div class="row">';
									ret += '<div class="col-sm-10">';

									ret += '<table class="table">' + "\n";
									ret += '  <thead>' + "\n";
									ret += '  <tr>' + "\n";
									for (ssf_i=0,ssf_len=section_sheet_fields.length; ssf_i<ssf_len; ssf_i++) {
										ret += '  <th><small>';
										var field_title = section_sheet_fields[ssf_i];
										if (has_setting(unit, section+".sheet_display_names."+field_title)) {
											field_title = peek_setting(unit, section+".sheet_display_names."+field_title);
										}
										ret += field_title;
										ret += '  </small></th>' + "\n";
									}
									ssf_i = null;
									ssf_len = null;
									ret += '  </tr>' + "\n";
									ret += '  </thead>' + "\n";
									for (ui_i=0,ui_len=unused_items.length; ui_i<ui_len; ui_i++) {
										ret += '  <tr>' + "\n";
										for (ssf_i=0,ssf_len=section_sheet_fields.length; ssf_i<ssf_len; ssf_i++) {
											ret += '  <td class="table-warning">';
											var ssf = section_sheet_fields[ssf_i];
											var field_val = "&nbsp; ";
											if (ssf in unused_items[ui_i].tmp) {
												field_val = unused_items[ui_i].tmp[ssf];
											}
											else if (ssf in unused_items[ui_i]) {
												field_val = unused_items[ui_i][ssf];
											}
											ret += field_val;
											ret += '  </td>' + "\n";
										}
										ssf_i = null;
										ssf_len = null;
										ret += '  </tr>' + "\n";
									}
									ui_i = null;
									ui_len = null;
									ret += '</table>' + "\n";
									ret += '    </div>';
									ret += '  </div>';
								}
							}
							else {
								ret += '<div class="alert alert-warning">missing sheet fields setting, so showing raw data:</div>';
								for (ui_i=0,ui_len=unused_items.length; ui_i<ui_len; ui_i++) {
									ret += '<div>'+JSON.stringify(unused_items[ui_i])+'</div>';
								}
								ui_i = null;
								ui_len = null;
							}
						}
						else {
							//selected billing cycle entry is blank or there is an error
							ret += '<div class="row">';
							ret += '<div class="col-sm-10">';
							if (fun.is_not_blank(error)) ret += '<div class="alert alert-warning">'+error+"</div>";
							ret += '</div><!--end col-sm-10-->';
							ret += '</div>';
						}
					}
					else ret += '<div class="alert alert-warning">'+section+'.default_groupby must be in settings in order to do reports on '+section+'</div>';
				}
				//else console.log("no selected_number for "+mode+" helper.");
			}
			else {
				//ret += 'You do not have permission to access '+mode+' in this section' + "\n";
				console.log(username+' does not have permission to access '+mode+' in this section');
			}
			return new Handlebars.SafeString(ret);
		},
		long_description: function(unit, section, field_name, opts) {
			var ret = "";
			if (has_setting(unit, section+".long_descriptions."+field_name)) {
				ret += peek_setting(unit, section+".long_descriptions."+field_name);
			}
			return new Handlebars.SafeString(ret);
		},
		show_reports: function(container_enable, unit, section, category, dataset_name, username, years, months, days, selected_year, selected_month, selected_day, selected_number, section_report_edit_field, opts) {
			var ret = "";
			var mode = "reports";
			var year = null;
			var month = null;
			var day = null;
			if (fun.is_not_blank(selected_year)) {
				year = fun.zero_padded(selected_year, 4);
			}
			if (fun.is_not_blank(selected_month)) {
				month = fun.zero_padded(selected_month, 2);
			}
			if (fun.is_not_blank(selected_day)) {
				day = fun.zero_padded(selected_day, 2);
			}
			var table_info = get_dataset_info(unit, section, category, dataset_name);
			///TODO: eliminate years, months, days
			if (table_info.enable) {
				if (user_has_section_permission(unit, username, section, mode)) {
					if (has_setting(unit, section+".sheet_fields")) {
						var section_sheet_fields = peek_setting(unit, section+".sheet_fields");
						var ssf_i;
						var ssf_len=section_sheet_fields.length;
						var y_path;
						var dataset_path;
						//ret += '<div class="panel panel-default">';
						//ret += '<div class="panel-body">';
						ret += "\n";
						if (container_enable==="true") ret += '<div class="container">' + "\n";
						ret += '  <div class="row">' + "\n";
						ret += '    <div class="col-sm-2">' + "\n";
						ret += get_year_month_select_buttons(unit, section, dataset_name, mode, username, years, months, selected_year, selected_month)+"\n";
						ret += '    </div><!--end col-sm-2-->' + "\n";
						ret += '    <div class="col-sm-8">' + "\n";
						ret += '      <h3>Queries</h3>';
						var selected_field = null;
						var this_rate = 0.0;
						if (!section) console.log("ERROR: no section given to "+mode+" helper");
						if ( has_setting(unit, section+".extended_hours_hourly_price") ) {
							var section_friendly_name = section;
							var this_start_time_string = "";
							if (has_setting(unit, section+".local_start_time"))
								this_start_time_string = peek_setting(unit, section+".local_start_time");
							if (has_setting(unit, section+".display_name")) section_friendly_name = peek_setting(unit, section+".display_name");
							this_rate = peek_setting(unit, section+".extended_hours_hourly_price");
							ret += '    <form class="form-inline" id="autofill-query" action="' + config.proxy_prefix_then_slash + 'autofill-query" method="post">' + "\n";
							ret += '    <input type="hidden" name="unit" id="unit" value="'+unit+'"/>' + "\n";
							ret += '    <input type="hidden" name="section" id="section" value="'+section+'"/>' + "\n";
							ret += '    <input type="hidden" name="category" id="category" value="'+category+'"/>' + "\n";
							ret += '    <input type="hidden" name="dataset_name" id="dataset_name" value="'+dataset_name+'"/>' + "\n";
							ret += '    <input type="hidden" name="mode" id="mode" value="'+mode+'"/>' + "\n";
							ret += '    <input type="hidden" name="selected_year" id="selected_year" value="'+selected_year+'"/>' + "\n";
							ret += '    <input type="hidden" name="selected_month" id="selected_month" value="'+selected_month+'"/>' + "\n";
							ret += '    <button type="submit" class="btn btn-primary"/>Autofill All</button>' + "\n";
							ret += '    </form>' + "\n";
							//region CHANGE ALL MATCHING
							if (!selected_field) {
								if (section_report_edit_field.hasOwnProperty(section) && section_report_edit_field[section].hasOwnProperty(mode)) {
									selected_field = section_report_edit_field[section][mode];
									//var selected_field_msg = "null";
									//if (selected_field) selected_field_msg=selected_field;
									//console.log("[ _ ] got runtime value "+mode+".selected_field_default: "+selected_field_msg);
								}
								if (!selected_field) {
									if (has_setting(unit, section+"."+mode+".selected_field_default")) {//else {
										selected_field = peek_setting(unit, section+"."+mode+".selected_field_default");
										//var selected_field_msg = "null";
										//if (selected_field) selected_field_msg = selected_field;
										//console.log("[ . ] got setting "+mode+".selected_field_default: "+selected_field_msg);
										//console.log("      (actually "+_settings[section][mode]["selected_field_default"]+")");
										//console.log("      (now "+selected_field+")");
									}
								}
							}
							if (   has_setting(unit, section+".autofill_requires")  &&  // autofill_requires.hasOwnProperty(section)
								(  selected_field  ||  (has_setting(unit, section + ".default_groupby"))  )   ) {
									//ret += " " + default_groupby[section];
								var this_field = null;
								if (selected_field) this_field = selected_field;
								else if (has_setting(unit, section+".default_groupby"))
									this_field = peek_setting(unit, section+".default_groupby");
								if (has_setting(unit, section+".autofill_requires."+this_field)) {
									//ret += " Change entries for person where";
									//ret += ":";
									ret += '<form class="form-horizontal" id="update-query" action="' + config.proxy_prefix_then_slash + 'update-query" method="post">' + "\n";
									ret += '  <input type="hidden" name="unit" id="unit" value="'+unit+'"/>' + "\n";
									ret += '  <input type="hidden" name="section" id="section" value="'+section+'"/>' + "\n";
									ret += '  <input type="hidden" name="category" id="category" value="'+category+'"/>' + "\n";
									ret += '  <input type="hidden" name="dataset_name" id="dataset_name" value="'+dataset_name+'"/>' + "\n";
									ret += '  <input type="hidden" name="mode" id="mode" value="'+mode+'"/>' + "\n";
									ret += '  <input type="hidden" name="selected_year" id="selected_year" value="'+selected_year+'"/>' + "\n";
									ret += '  <input type="hidden" name="selected_month" id="selected_month" value="'+selected_month+'"/>' + "\n";
									for (var _s_i=0, _s_len=_settings[section].autofill_requires[this_field].length; _s_i<_s_len; _s_i++) {
										var required_key = _settings[section].autofill_requires[this_field][_s_i];
										var this_val = "";
										var field_friendly_name = required_key;
										if (has_setting(unit, section+".sheet_display_names."+required_key))
											field_friendly_name = peek_setting(unit, section+".sheet_display_names."+required_key); // uses sheet display name since shorter than section+".form_display_names"
										ret += '  <div class="input-group mb-2 mb-sm-0">' + "\n";
										ret += '  <span class="input-group-addon" >'+field_friendly_name+':</span>' + "\n";
										//ret += '    <div class="col-sm-10">';
										ret += '      <input type="text" class="form-control" name="where_'+required_key+'" id="'+required_key+'" value="'+this_val+'"/>' + "\n";
										//ret += '    </div>';
										ret += '  </div>';
									}
									ret += '  <input type="hidden" name="selected_field" id="selected_field" value="'+this_field+'"/>' + "\n";
									var this_field_friendly_name = this_field;
									if (has_setting(unit, section+".sheet_display_names."+this_field))
										this_field_friendly_name = peek_setting(unit, section+".sheet_display_names."+this_field);

									ret += '  <div class="input-group mb-2 mb-sm-0">' + "\n";
									ret += '  <span class="input-group-addon" style="font-weight:bold">Change '+this_field_friendly_name+' to:</span>' + "\n";
									//ret += '    <div class="col-sm-10">';
									ret += '      <input type="text" class="form-control" name="set_value" id="set_value" value=""/>' + "\n"; //'+val+'
									//ret += '    </div>';
									ret += '  </div>' + "\n";

									ret += '  <button type="submit" class="btn btn-primary" style="font-weight:bold"/>Change All Matching</button>' + "\n";
									ret += '</form>' + "\n";
								}
								else {
								}
							}
							else {
							}
							//endregion CHANGE ALL MATCHING


							ret += '    </div><!--end 2nd col: col-sm-8-->' + "\n";
							ret += '    <div class="col-sm-2">' + "\n";
							ret += '    <h3>Report Settings</h3>' + "\n";
							ret += "    Hourly Rate for "+section_friendly_name+": ";
							ret += '            <form class="form-inline" id="change-section-settings" action="' + config.proxy_prefix_then_slash + 'change-section-settings" method="post">' + "\n";
							ret += '              <div class="form-row align-items-center">' + "\n";
							ret += '                <input type="hidden" name="unit" id="unit" value="'+unit+'"/>' + "\n";
							ret += '                <input type="hidden" name="section" id="section" value="'+section+'"/>' + "\n";
							//ret += '                <input type="hidden" name="category" id="category" value="'+category+'"/>' + "\n";
							//ret += '                <input type="hidden" name="dataset_name" id="dataset_name" value="'+dataset_name+'"/>' + "\n";
							ret += '                <input type="hidden" name="mode" id="mode" value="'+mode+'"/>' + "\n";
							ret += '                <input type="hidden" name="selected_setting" id="selected_setting" value="extended_hours_hourly_price"/>' + "\n";
							//ret += '               <div class="col-auto">' + "\n";
							ret += '                <input type="text" class="form-control mb-2 mb-sm-0" size="4" name="selected_setting_value" id="selected_setting_value" value="'+this_rate+'"/>' + "\n";
							//ret += '               </div>' + "\n";
							//ret += '               <div class="col-auto">' + "\n";
							ret += '                <button type="submit" class="btn btn-default">Save</button>' + "\n";
							//ret += '               </div>' + "\n";
							ret += '              </div>' + "\n";
							ret += '            </form>' + "\n";

							var free_from_caption = "free_from";
							if (has_setting(unit, section+".sheet_display_names.free_from"))
								free_from_caption = peek_setting(unit, section+".sheet_display_names.free_from");
							var free_to_caption = "free_to";
							if (peek_setting(unit, section+".sheet_display_names.free_to"))
								free_to_caption = peek_setting(unit, section+".sheet_display_names.free_to");
							ret += "             "+free_from_caption+"\n";
							ret += '            <form class="form-inline" id="change-section-settings" action="' + config.proxy_prefix_then_slash + 'change-section-settings" method="post">' + "\n";
							ret += '              <input type="hidden" name="unit" id="unit" value="'+unit+'"/>' + "\n";
							ret += '              <input type="hidden" name="section" id="section" value="'+section+'"/>' + "\n";
							ret += '              <input type="hidden" name="mode" id="mode" value="'+mode+'"/>' + "\n";
							ret += '                <input type="hidden" name="selected_setting" id="selected_setting" value="local_start_time"/>' + "\n";
							ret += '              <input type="text" class="form-control" size="8" name="selected_setting_value" id="selected_setting_value" value="'+this_start_time_string+'"/>' + "\n";
							ret += '              <button type="submit" class="btn btn-default"/>Save</button>' + "\n";
							ret += '            </form>';
							ret += " "+free_to_caption+" ";
							var this_end_time_string = "";
							if (has_setting(unit, section+".local_end_time"))
								this_end_time_string = peek_setting(unit, section+".local_end_time");
							ret += '<form class="form-inline" id="change-section-settings" action="' + config.proxy_prefix_then_slash + 'change-section-settings" method="post">';
							ret += '  <input type="hidden" name="unit" id="unit" value="'+unit+'"/>' + "\n";
							ret += '  <input type="hidden" name="section" id="section" value="'+section+'"/>' + "\n";
							ret += '  <input type="hidden" name="mode" id="mode" value="'+mode+'"/>' + "\n";
							ret += '  <input type="hidden" name="selected_setting" id="selected_setting" value="local_end_time"/>' + "\n";
							ret += '  <input type="text" class="form-control" size="8" name="selected_setting_value" id="selected_setting_value" value="'+this_end_time_string+'"/>' + "\n";
							ret += '  <button class="btn btn-default" type="submit">Save</button>' + "\n";
							ret += '</form>' + "\n";

							if (selected_field) {//section_report_edit_field.hasOwnProperty(section)) {
								if (!section_report_edit_field.hasOwnProperty(section)) section_report_edit_field[section] = {};
								if (!section_report_edit_field[section].hasOwnProperty(mode)) section_report_edit_field[section][mode] = selected_field;
								//if (!peek_setting(unit, section+"."+mode+".selected_field_default")) {
								//	console.log("  setting "+mode+".selected_field_default to "+selected_field);
								//	poke_setting(unit, section+"."+mode+".selected_field_default", selected_field);
								//}
								//ret += "Selected Field:";
								//ret += '<form class="form-inline" id="change-selection" action="' + config.proxy_prefix_then_slash + 'change-selection" method="post">' + "\n";
								//ret += '  <input type="hidden" name="unit" id="unit" value="'+unit+'"/>' + "\n";
								//ret += '  <input type="hidden" name="section" id="section" value="'+section+'"/>' + "\n";
								//ret += '  <input type="hidden" name="mode" id="mode" value="'+mode+'"/>' + "\n";
								//ret += '  <input type="text" class="form-control" size="8" name="change_section_report_edit_field" id="change_section_report_edit_field" value="'+section_report_edit_field[section][mode]+'"/>' + "\n";
								//ret += '  <button class="btn btn-default" type="submit">Select</button>' + "\n";
								//ret += '</form>' + "\n";
							}
							else {
							}
						}
						else {
							ret += '<!--no hourly rate specified for section '+section+'-->';
						}
						ret += '    </div><!--end last col-sm-->' + "\n";
						ret += '  </div><!--end only row-->' + "\n";
						if (container_enable==="true") ret += '</div><!--end ribbon container-->' + "\n";
						// END OF RIBBON
						ret += '<hr/>' + "\n";
						ret += '<div align="center">' + "\n";
						if (selected_month) {
							ret += '<p>'+"\n";
							ret += '<h3>Transaction Reports</h3>'+"\n";
							ret += '<div><em>For billing, click a year above.</em></div>'+"\n";
							ret += '</p>'+"\n";
						}
						else if (selected_year) {
							ret += '<p>'+"\n";
							ret += '<h3>Billing</h3>'+"\n";
							ret += '<div><em>To view details, click a month above.</em></div>'+"\n";
							ret += '</p>'+"\n";
						}
						ret += '</div>' + "\n";
						if (selected_month) {
							var items_by_date = {};
							//NOTE: already checked for section+".sheet_fields" above
							var parsing_info = "";
							var parsing_error = "";
							var items = {}; //formerly a list: is now keyed by actual key (filename)
							ret += '<table class="table table-bordered table-sm">' + "\n";
							ret += '  <thead>' + "\n";
							ret += '    <tr>' + "\n";
							var url_params = "?";
							url_params += "unit="+unit+"&";
							url_params += "section="+section+"&";
							url_params += "category="+category+"&";
							url_params += "dataset_name="+dataset_name+"&";
							url_params += "mode="+mode+"&";

							ret += '      <th>&nbsp;<!--status--></th>';
							if (fun.visual_debug_enable) ret += '      <th><small>#</small></th>' + "\n";
							for (ssf_i=0; ssf_i<ssf_len; ssf_i++) {
								var key = section_sheet_fields[ssf_i];
								var name = key;
								if (selected_field==key) ret += '      <th class="bg-info">' + "\n";
								else ret += '      <th>' + "\n";
								ret += '<small>';
								if (has_setting(unit, section+".sheet_display_names."+key)) {
									name = peek_setting(unit, section+".sheet_display_names."+key);
								}
								if (default_total.hasOwnProperty(section)) {
									if (key==default_total[section]) name = "Total " + name; //such as Total Accrued
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
								var href = config.proxy_prefix_then_slash+"change-selection"+url_params+"change_section_report_edit_field="+override_key; //asdf url_params is missing unit, category, dataset_name
								if (selected_field==key || key.startsWith("=")|| key.endsWith("_by")) ret += name;
								else ret += '<a href="'+href+'">'+name+'</a>';
								ret += '</small></th>';
							}
							ret += '    </tr>' + "\n";
							ret += '  </thead>' + "\n";
							ret += '  <tbody>' + "\n";

							//NOTE: don't render rows yet--this loop prepares the data
							var d_path;
							var item_path;
							dataset_path = get_dataset_path_if_exists_else_null(unit, section, category, dataset_name, false);
							//unit, section, category, dataset_name are all helper params passed from handlebars template
							if (fsc[unit][section][category].hasOwnProperty(dataset_name)) {
								y_path = dataset_path + "/" + selected_year;
								var m_path = y_path + "/" + selected_month;
								var prepared_count = 0;
								for (var day_i=0; day_i<days.length; day_i++) {
									var this_day = fun.zero_padded(days[day_i],2);
									d_path = m_path + "/" + this_day;
									var di = get_day_info(fsc[unit][section][category][dataset_name], [year,month,this_day]);
									if (di.enable) {  // if (fs.existsSync(d_path)) {
										//jk item_keys = fun.getVisibleFiles(d_path);
										//jk if (!dat[section][selected_year][selected_month][this_day]) dat[section][selected_year][selected_month][this_day]={};
										//jk dat[section][selected_year][selected_month][this_day].item_keys = item_keys;
										items = fsc[unit][section][category][dataset_name][year][month][this_day];
										//console.log("## ITEM KEYS: "+fun.to_ecmascript_value(item_keys));
										//console.log("(ITEM KEYS.length:"+item_keys.length+")");
										//console.log("## ITEMS:"+items);
										var msg = "";
										//TODO: deprecate item_key_i, item_keys
										//for (var item_key_i in item_keys) { asdf items do not show
										for (var item_key in items) {
											if (items.hasOwnProperty(item_key)) {
												//NOTE: there is no per-day html since that doesn't matter (unless date should be shown)
												//ret += '    <tr>' + "\n";
												//var item_key = item_keys[item_key_i];
												item_path = d_path + "/" + item_key;
												if (item_key.endsWith(".yml")) {
													//try {
													//dat[section][year][month][this_day][item_key] = yaml.readSync(item_path, "utf8");
													//var original_item = dat[section][month][month][this_day][item_key];
													var original_item = items[item_key];
													original_item.key = item_key;
													if (!original_item.hasOwnProperty("tmp"))
														original_item.tmp = {};
													original_item.tmp["=get_day_from_path()"] = this_day;
													original_item.tmp["=get_date_from_path()"] = selected_year + "-" + selected_month + "-" + this_day;
													//original_item.tmp["=get_origin_date()"] = null;
													if (!original_item.tmp.hasOwnProperty("=get_origin_date()")) {
														console.log("caching '=get_origin_date()' for "+item_path);
														if (original_item.hasOwnProperty("date"))
															original_item.tmp["=get_origin_date()"] = original_item.date;
														else if (original_item.hasOwnProperty("ctime"))
															original_item.tmp["=get_origin_date()"] = original_item.ctime.substring(0,10);
														else {
															var this_item_path = d_path + "/" + item_key;
															var stats = fs.statSync(this_item_path);
															var ctime = null;
															if (stats.hasOwnProperty("ctime")) original_item.tmp["=get_origin_date()"] = stats.ctime;
															//see Oleg Mikhailov on https://stackoverflow.com/questions/7559555/last-modified-file-date-in-node-js edited May 12 '16 answered May 11, '16
															//else if (stats.hasOwnProperty("mtime")) original_item.tmp["=get_origin_date()"] = stats['mtime'];
															//ctime = new Date(util.inspect(stats.mtime));
															//TODO: why doesn't this work (util not defined [even though installed via npm and required at top of file]): var mtime = new Date(util.inspect(stats.mtime));
															if (ctime!==null) original_item.tmp["=get_origin_date()"] = ctime;
														}
													}

													if (!original_item.tmp.hasOwnProperty("date")) {
														original_item.tmp.date = fun.get_date_or_stated_date(original_item, item_key+" in month view");
														if (original_item.tmp.date===null) original_item.tmp.date = selected_year + "-" + selected_month + "-" + this_day; //pre-0.1.0 where date wasn't saved
													}
													if (!original_item.tmp.hasOwnProperty("time")) {
														original_item.tmp.time = fun.get_time_or_stated_time(original_item, "show_reports region that prepares the data");
														if (original_item.tmp.time===null) original_item.tmp.time = item_key.substring(0,2)+":"+item_key.substring(2,4)+":"+item_key.substring(4,6);
													}
													//tui: table-unique identifier
													original_item.tmp.tui = selected_year + "/" + selected_month + "/" + this_day + "/" + item_key;
													if (!items_by_date.hasOwnProperty(original_item.tmp["=get_date_from_path()"])) {
														items_by_date[original_item.tmp["=get_date_from_path()"]] = [];
														//console.log("added date to items_by_date: '"+original_item.tmp["=get_date_from_path()"]+"'");
														//console.log("added date to items_by_date at date "+original_item.tmp["=get_date_from_path()"]);
													}
													items_by_date[original_item.tmp["=get_date_from_path()"]].push(original_item);
													//dat[section][selected_year][selected_month][this_day][this_item] = yaml.readSync(item_path, "utf8");
													//var this_item = original_item;
													var this_item = JSON.parse(JSON.stringify(original_item));
													var ymd_array = null;
													if (!this_item.tmp.year) {  // if (!this_item.tmp.hasOwnProperty("year")) {
														if (this_item.tmp.date) {
															ymd_array = this_item.tmp.date.split("-");
															if ((ymd_array!==null) && (ymd_array.length==3)) {
																this_item.tmp.year = year; // padded version same for whole method
																this_item.tmp.month = month; // padded version same for whole method
																this_item.tmp.day = this_day; // padded version from loop (since unlike this_day, day is same for whole method)
																console.log("(debug only in show_reports) CACHED .year "+year+" .month "+month+" .day "+this_day+" for "+item_key);
															}
															else console.log("ERROR in show_reports: bad year,month,day array from splitting =get_date_or_stated_date() " + original_item.tmp.date);
														}
														else console.log("ERROR in show_reports: missing this_item.date for " + original_item.tmp.tui);
													}
													else console.log("(debug only in show_reports) already cached year for " + original_item.tmp.tui);
													var span_info = null;
													span_info = get_care_time_info(this_item, unit, section);
													if (span_info.hasOwnProperty("error")) {
														//TODO: ? or later when warning is shown
													}
													// process only section sheet fields, since only they can be processed accurately:
													for (ssf_i=0; ssf_i<ssf_len; ssf_i++) {
														//ret += '      <td>' + "\n";
														var this_sff = section_sheet_fields[ssf_i];
														//NOTE: intentionally gets desired fields only
														if (this_sff.substring(0,1)=="=") {
															var ender_i = this_sff.indexOf("(");
															if (ender_i>-1) {
																var op = this_sff.substring(1,ender_i).trim();
																if ((typeof span_info.seconds)=="string") span_info.seconds = parseInt(span_info.seconds);
																var qty_times_seconds = span_info.seconds;
																if ("qty" in this_item) {
																	qty_times_seconds *= parseInt(this_item.qty);  //ok since there only is a number type (no truncation will occur)
																	if (span_info.seconds>0) {
																		if (qty_times_seconds<span_info.seconds) {
																			console.log("WARNING: " + span_info.seconds + " sec times qty " + this_item.qty + " (parsed as '"+parseInt(this_item.qty)+"') was lower than "+span_info.seconds+", so reverted to non-qty value!");
																			qty_times_seconds = span_info.seconds;
																		}
																		//else console.log("[ ] verbose message: qty_times_seconds is "+qty_times_seconds);
																	}
																}
																if (op == "careprice") {
																	if (span_info.hasOwnProperty("seconds")) {
																		this_item.tmp["=careprice()"] = (qty_times_seconds/60.0/60.0 * this_rate).toFixed(2); //NOTE: toFixed returns a STRING
																		if ((!this_item.hasOwnProperty("active")) || fun.is_true(this_item.active)) {
																			if (span_info.hasOwnProperty("error")) {
																				if (parsing_error.indexOf(span_info.error)<0) parsing_error += span_info.error;
																			}
																			if (span_info.hasOwnProperty("warning")) parsing_info += "\n<br/>NOTE: " + span_info.warning + " in " + item_path;
																		}
																	}
																	else {
																		this_item.tmp["=careprice()"] = 0.00;
																		if ((!this_item.hasOwnProperty("active")) || fun.is_true(this_item.active)) {
																			parsing_error += "\n<br/>";
																			if (span_info.hasOwnProperty("error")) {
																				if (parsing_error.indexOf(span_info.error)<0) parsing_error += span_info.error;
																			}
																		}
																	}
																}
																else if (op == "caretime") {
																	//span_info = get_care_time_info(this_item, unit, section);
																	if (span_info.hasOwnProperty("seconds")) {
																		this_item.tmp["=caretime()"] = qty_times_seconds;
																	}
																}
																else if (op == "caretime_m") {
																	//span_info = get_care_time_info(this_item, unit, section);
																	if (span_info.hasOwnProperty("seconds")) {
																		this_item.tmp["=caretime_m()"] = qty_times_seconds/60.0;
																	}
																}
																else if (op == "caretime_h") {
																	//span_info = get_care_time_info(this_item, unit, section);
																	if (span_info.hasOwnProperty("seconds")) {
																		this_item.tmp["=caretime_h()"] = (qty_times_seconds/60.0/60.0).toFixed(3); ////NOTE: toFixed returns a STRING
																	}
																}
																//below are already done further up (before copying item to this_item)
																//else if (op == "get_date_from_path") {
																//	this_item.tmp["=get_date_from_path()"] = this_item.tmp["=get_date_from_path()"];  // also the following is always accurate in this context: selected_year+"-"+selected_month+"-"+this_day;
																//}
																//else if (op == "get_day_from_path") {
																//	this_item.tmp["=get_day_from_path()"] = this_item.tmp["=get_day_from_path()"];
																//}
															}
															else {
																console.log("undefined function :" + this_sff);
															}
														}
														else if (this_item.hasOwnProperty(this_sff)) {
														//not needed since preprocessing first
														//if (this_item.hasOwnProperty(this_sff)) {
															//var val = this_item[this_sff];
															//ret += val;
															//var val = items[this_sff];
															//console.log("    " + this_sff + ": " + val);
														}
														//ret += '</td>' + "\n";
													}
													//}
													//catch (err) {
													//	msg += "\n<br/>Could not finish reading "+item_path+": "+err;
													//}
													prepared_count++;
												}
												else console.log("Skipped "+item_path+": not a data file");
											}
											else console.log("(debug only) Skipped inherited property "+item_key);
										}//end for item keys

										if (msg.length>0) {
											//res.session.error=msg;
											console.log(msg);
											ret += '<div class="alert alert-danger">'+msg+'</div>' + "\n";
										}
									}
									else console.log("Invalid path resulting in cache miss: '"+d_path+"' ("+di.error+")");
									//else console.log("Invalid path resulting in stale days array: '"+d_path+"'");
								}//end for days (PREPARING DATA before showing)
								if (prepared_count < 1) {
									console.log("WARNING in show_reports: prepared_count is "+prepared_count);
								}
								d_path = null;  // out of loop
								item_path = null;  // out of loop
								var hdv_field_name = null;
								var hdv_item_splitter_name = null;
								if (has_setting(unit, section+".list_implies_qty")) hdv_field_name = peek_setting(unit, section+".list_implies_qty");
								if (hdv_field_name===null) console.log("[ verbose message ] no "+"settings."+section+".list_implies_qty");
								if (has_setting(unit, section+".list_implies_multiple_entries")) hdv_item_splitter_name = peek_setting(unit, section+".list_implies_multiple_entries");
								if (hdv_item_splitter_name===null) console.log("[ verbose message ] no "+section+".list_implies_multiple_entries");
								var identifying_fields = null;
								if (has_setting(unit, section+".autofill_requires")) {
									identifying_fields = [];
									var ar = peek_setting(unit, section+".autofill_requires");
									for (var k in ar) {
										var sub_ar_len = ar[k].length;
										for (var sub_i=0; sub_i<sub_ar_len; sub_i++) {
											if (!fun.array_contains(identifying_fields, ar[k][sub_i])) identifying_fields.push(ar[k][sub_i]);
										}
									}
									if (identifying_fields.length<1) {
										console.log("WARNING: <section name>.autofill_requires setting has zero variable-name-as key arrays, so duplicate detection won't work.");
										identifying_fields = null;
									}
									else console.log("[ ] verbose message: Using identifying fields for duplicate detection (unique fields from <section name>.autofill_requires arrays): "+JSON.stringify(identifying_fields));
								}
								else console.log("WARNING: <section name>.autofill_requires does not exist in settings, so duplicate detection won't work.");

								var debug_stack = [];
								//for (var item_i=0, items_len=items.length; item_i<items_len; item_i++) {
								for (var item_key in items) {
									var item = items[item_key];
									var key_as_identifier = item_key;
									var ender_i = key_as_identifier.indexOf(".");
									if (ender_i>-1) {
										key_as_identifier = key_as_identifier.substr(0,ender_i);
									}
									d_path = m_path+"/"+item.tmp.day;
									if (fun.is_blank(item.tmp.day)) {
										console.log("[   ] cache ERROR in show_reports: tmp.day is "+item.tmp.day+" for "+item_key);
									}
									item_path = d_path+"/"+item.key;
									//console.log();
									//console.log("[CHECKING#"+item_key+"]");
									var item_enable = (!item.hasOwnProperty("active") || (fun.is_true(item.active)));
									ret += '    <tr>' + "\n";
									var a_name = 'scrollto'+key_as_identifier;
									var dup_index = -1;
									var this_date_items = null;
									var status_class = "glyphicon glyphicon-remove";
									var status_style = "color:black";
									var new_value = "false";
									if (!fun.item_is_active(item)) {
										status_class = "glyphicon glyphicon-remove-sign";
										status_style = "color:gray";
										new_value = true;
									}
									if (item.hasOwnProperty("split_destinations")) {
										status_class = "glyphicon glyphicon-list";
									}
									else if (item.hasOwnProperty("duplicate_of_key")) {
										status_class = "glyphicon glyphicon-tags";
									}
									ret += '      <td>';
									ret += '<form class="form-horizontal" id="change-microevent-field" action="' + config.proxy_prefix_then_slash + 'change-microevent-field" method="post">' + "\n";
									ret += '  <input type="hidden" name="scroll_to_named_a" id="scroll_to_named_a" value="'+a_name+'"/>' + "\n";
									ret += '  <input type="hidden" name="unit" id="unit" value="'+unit+'"/>' + "\n";
									ret += '  <input type="hidden" name="section" id="section" value="'+section+'"/>' + "\n";
									ret += '  <input type="hidden" name="category" id="category" value="'+category+'"/>' + "\n";
									ret += '  <input type="hidden" name="dataset_name" id="dataset_name" value="'+dataset_name+'"/>' + "\n";
									ret += '  <input type="hidden" name="mode" id="mode" value="'+mode+'"/>' + "\n";
									ret += '  <input type="hidden" name="selected_year" id="selected_year" value="'+item.tmp.year+'"/>' + "\n";
									ret += '  <input type="hidden" name="selected_month" id="selected_month" value="'+item.tmp.month+'"/>' + "\n";
									ret += '  <input type="hidden" name="selected_day" id="selected_day" value="'+item.tmp.day+'"/>' + "\n";
									ret += '  <input type="hidden" name="selected_key" id="selected_key" value="'+item.key+'"/>' + "\n";
									ret += '  <input type="hidden" name="selected_field" id="selected_field" value="active"/>' + "\n";
									ret += '  <input type="hidden" name="set_value" id="set_value" value="'+((fun.item_is_active(item))?'false':'true')+'"/>' + "\n";
									ret += '  <input type="hidden" name="status_changed_by" id="status_changed_by" value="'+username+'"/>' + "\n";  // signals change-microevent-field and _write_record_as_is that this entry deactivation was done manually
									ret += '  <button class="btn" type="submit">' + "\n";
									ret += '<span class="'+status_class+'" style="'+status_style+'"></span>' + "\n";
									ret += '</button>' + "\n";
									ret += '</form>' + "\n";

									ret += '</td>';
									if (fun.visual_debug_enable) ret += '      <td>'+item.key+'</td>';
									var match_count=null;
									if (item_enable && user_has_section_permission(unit, username, section, mode)) {

										if (has_setting(unit, section+".form_fields")) {
										//console.log("[ == ] this "+this_date+" "+this_time+"..."); //this_date does not exist in this scope
											//if (items_by_date.hasOwnProperty(item.tmp["=get_date_from_path()"])) {
											var section_form_fields = peek_setting(unit, section+".form_fields");
											if (item.tmp["=get_date_from_path()"] in items_by_date) {
												this_date_items = items_by_date[item.tmp["=get_date_from_path()"]];
												//for (var prev_i=0; prev_i<item_i; prev_i++) { //this would be even slower
												var active_count = 0;
												for (var inner_i=0,inner_len=this_date_items.length; inner_i<inner_len; inner_i++) {
													//if ((!items[prev_i].hasOwnProperty("active")) || fun.is_true(items[prev_i].active)) {
													if ((!this_date_items[inner_i].hasOwnProperty("active")) || fun.is_true(this_date_items[inner_i].active)) {
														active_count++;
														if (item.key != this_date_items[inner_i].key) {
															match_count = 0;
															var ff_len = section_form_fields.length;
															//var prev_time = fun.get_time_or_stated_time(items[prev_i], "previous day while showing prepared data in show_reports");
															//var prev_date = fun.get_date_or_stated_date(items[prev_i], "item# "+item_key+"&"+prev_i);
															var prev_time = this_date_items[inner_i].tmp.time;
															var prev_date =  this_date_items[inner_i].tmp.date; //pre-0.1.0 where date wasn't saved
															var this_time = item.tmp.time;
															//var this_date = fun.get_date_or_stated_date(item, "item# "+item_key+"&"+prev_i);
															var this_date = item.tmp.date;
															//console.log("[ == ] this "+this_date+" "+this_time+", prev "+prev_date+" "+prev_time+"...");
															if (prev_date==this_date) {
																//console.log("[ match ] "+prev_date + " == " + this_date);
																if ((this_time.indexOf("NaN")<=-1)&&(prev_time.indexOf("NaN")<=-1)) {
																	if (fun.is_not_blank(this_date) && fun.is_not_blank(prev_date)) {
																		if ((prev_time!==null) && (this_time!==null)) {
																			var is_out_of_range = false;
																			var this_is_after_school = is_after_school(unit, section, this_date+" "+this_time);
																			if ((!this_is_after_school) && (!is_before_school(unit, section, this_date+" "+this_time))) is_out_of_range = true;
																			var prev_is_after_school = is_after_school(unit, section, prev_date+" "+prev_time);
																			if ((!prev_is_after_school) && (!is_before_school(unit, section, prev_date+" "+prev_time))) is_out_of_range = true;
																			var these_fields = section_form_fields;
																			if (identifying_fields!==null) these_fields = identifying_fields;
																			var tf_len = these_fields.length;
																			if ((!is_out_of_range) && (this_is_after_school==prev_is_after_school)) { //either before or after, as long as same
																				for (var ff_i=0; ff_i<tf_len; ff_i++) {
																					/*
																					if (fun.is_blank(item[these_fields[ff_i]]) ||
																						(fun.safe_equals_ci(item[these_fields[ff_i]], items[prev_i][these_fields[ff_i]])) ||
																						(
																							((typeof item[these_fields[ff_i]])=="string") &&
																							((typeof items[prev_i][these_fields[ff_i]])=="string") &&
																							(item[these_fields[ff_i]].trim().toLowerCase() == items[prev_i][these_fields[ff_i]].trim().toLowerCase()) )
																					) {
																						//console.log(" [ == ] "+item[these_fields[ff_i]] + " is " + items[prev_i][these_fields[ff_i]]);
																						match_count++;
																					}
																					//else console.log(" [ <> ] "+item[these_fields[ff_i]] + " is not " + items[prev_i][these_fields[ff_i]]);
																					*/
																					if (these_fields[ff_i]=="stated_date") {
																						//if (item[these_fields[ff_i]] == this_date_items[inner_i][these_fields[ff_i]]) {
																						if (item.tmp.date==this_date_items[inner_i].tmp.date) {
																							console.log(" [ == ] "+item.tmp.date + " is " + this_date_items[inner_i].tmp.date);
																							match_count++;
																						}
																					}
																					else if (these_fields[ff_i]=="stated_time") {
																						//do not check time (duplicate can be different time!)
																						//if (item[these_fields[ff_i]] == this_date_items[inner_i][these_fields[ff_i]]) {
																						//if (item.tmp.time==this_date_items[inner_i].tmp.time) {
																							//console.log(" [ == ] "+item[these_fields[ff_i]] + " is " + this_date_items[inner_i][these_fields[ff_i]]);
																							match_count++;
																						//}
																					}
																					else {
																						if (//fun.is_blank(item[these_fields[ff_i]]) ||
																							(fun.safe_equals_ci(item[these_fields[ff_i]], this_date_items[inner_i][these_fields[ff_i]])) ||
																							(
																								((typeof item[these_fields[ff_i]])=="string") &&
																								((typeof this_date_items[inner_i][these_fields[ff_i]])=="string") &&
																								(item[these_fields[ff_i]].trim().toLowerCase() == this_date_items[inner_i][these_fields[ff_i]].trim().toLowerCase()) )
																						) {
																							//console.log(" [ == ] "+item[these_fields[ff_i]] + " is " + this_date_items[inner_i][these_fields[ff_i]]);
																							match_count++;
																						}
																					}
																					//console.log(" [ <> ] "+item[these_fields[ff_i]] + " is not " + this_date_items[inner_i][these_fields[ff_i]]);
																				}
																				if (match_count>=tf_len) {
																					//console.log("matched "+match_count+" of "+tf_len);//+JSON.stringify(these_fields));
																					//dup_index = prev_i;
																					//console.log("matched "+match_count+" of "+tf_len+" against "+item.tmp.tui);//+" among "+JSON.stringify(these_fields));
																					//debug only:
																					//if (item.first_name=="") {
																					//var msg = "[ == ] "+this_date+" "+this_time+" after:"+this_is_after_school+"; prev "+prev_date+" "+prev_time+" after:"+prev_is_after_school;
																					//if (!fun.array_contains(debug_stack, msg)) { //only show once
																					//	debug_stack.push(msg);
																					//	console.log(msg);
																					//}
																					//}

																					dup_index = inner_i;
																					break;
																				}
																				else {
																					if (match_count>1) {
																						//console.log("matched "+match_count+" of "+tf_len+" against "+item.tmp.tui+" among "+JSON.stringify(these_fields));
																					}
																				}
																			} //if more than one before school or after school for day
																		}
																		//else console.log(" [ <> ] prev_time is "+ prev_time + " this_time is " + this_time);
																	}
																	else console.log(" [ <> ] Warning: blank date ("+this_date_items[inner_i].tmp.date+" against "+item.tmp.date+")");
																}
																else console.log("Warning: Found NaN in time ("+this_date_items[inner_i].tmp.time+" against "+item.tmp.time+")");
															}
															//NOTE: this_date is out of scope
														}//else is same record (is self)

														match_count=null;
													}//if is an active entry
												}
												//console.log("Checked "+active_count+" active item(s) against "+item.tmp.tui);
											}//end if is in items_by_date
											else console.log("WARNING: "+item.tmp.tui+" must not be in correct folder, because "+item.tmp["=get_date_from_path()"]+" is not in items_by_date: "+JSON.stringify(Object.keys(items_by_date)));
										}
									}

									for (ssf_i=0; ssf_i<ssf_len; ssf_i++) {
										ret += '      <td>' + "\n";
										if (ssf_i===0) ret += '<a name="'+a_name+'"></a>';
										if (!item_enable) ret += '<span class="text-muted" style="text-decoration:line-through;">';
										var column_name = section_sheet_fields[ssf_i];
										//NOTE: intentionally gets desired fields only
										var val = "";
										if (column_name in item.tmp) { // if (item.tmp.hasOwnProperty(column_name)) {
											if (column_name=="=careprice()") {
												//var is_out_of_range = false;
												//if (   (!is_after_school(unit, section, item.tmp.date+" "+item.tmp.time)))
												//	&& (!is_before_school(unit, section, item.tmp.date+" "+item.tmp.time))) is_out_of_range = true;
												if (parseFloat(item.tmp[column_name])<=0.0) val = '<span style="color:red">' + item.tmp[column_name] + '</span>';
												else val = item.tmp[column_name];
											}
											else {
												//console.log(column_name + " is not careprice"); //debug only
												val = item.tmp[column_name];
											}
										}
										else if (item.hasOwnProperty(column_name)) {
											val = item[column_name];
										}
										if (selected_field==column_name) {
											//don't show value yet if selected (see below)
										}
										else ret += val;

										if (selected_field==column_name) { //show even if does NOT have property
											ret += '<form class="form-horizontal" id="change-microevent-field" action="' + config.proxy_prefix_then_slash + 'change-microevent-field" method="post">' + "\n";
											ret += '  <input type="hidden" name="scroll_to_named_a" id="scroll_to_named_a" value="'+a_name+'"/>' + "\n";
											ret += '  <input type="hidden" name="unit" id="unit" value="'+unit+'"/>' + "\n";
											ret += '  <input type="hidden" name="section" id="section" value="'+section+'"/>' + "\n";
											ret += '  <input type="hidden" name="category" id="category" value="'+category+'"/>' + "\n";
											ret += '  <input type="hidden" name="dataset_name" id="dataset_name" value="'+dataset_name+'"/>' + "\n";
											ret += '  <input type="hidden" name="mode" id="mode" value="'+mode+'"/>' + "\n";
											ret += '  <input type="hidden" name="selected_year" id="selected_year" value="'+item.tmp.year+'"/>' + "\n";
											ret += '  <input type="hidden" name="selected_month" id="selected_month" value="'+item.tmp.month+'"/>' + "\n";
											ret += '  <input type="hidden" name="selected_day" id="selected_day" value="'+item.tmp.day+'"/>' + "\n";
											ret += '  <input type="hidden" name="selected_key" id="selected_key" value="'+item.key+'"/>' + "\n";
											ret += '  <input type="hidden" name="selected_field" id="selected_field" value="'+selected_field+'"/>' + "\n";
											ret += '  <input type="text" size="13" name="set_value" id="set_value" value="'+val+'"/>' + "\n";
											ret += '  <button class="btn btn-default" type="submit">Save</button>' + "\n";
											ret += '</form>';
										}

										if ((dup_index>-1) && (ssf_i===0)) {
											ret += '<form class="form-horizontal" id="change-microevent-field" action="' + config.proxy_prefix_then_slash + 'change-microevent-field" method="post">' + "\n";
											ret += '  <input type="hidden" name="scroll_to_named_a" id="scroll_to_named_a" value="'+a_name+'"/>' + "\n";
											ret += '  <input type="hidden" name="unit" id="unit" value="'+unit+'"/>' + "\n";
											ret += '  <input type="hidden" name="section" id="section" value="'+section+'"/>' + "\n";
											ret += '  <input type="hidden" name="category" id="category" value="'+category+'"/>' + "\n";
											ret += '  <input type="hidden" name="dataset_name" id="dataset_name" value="'+dataset_name+'"/>' + "\n";
											ret += '  <input type="hidden" name="mode" id="mode" value="'+mode+'"/>' + "\n";
											ret += '  <input type="hidden" name="selected_year" id="selected_year" value="'+item.tmp.year+'"/>' + "\n";
											ret += '  <input type="hidden" name="selected_month" id="selected_month" value="'+item.tmp.month+'"/>' + "\n";
											ret += '  <input type="hidden" name="selected_day" id="selected_day" value="'+item.tmp.day+'"/>' + "\n";
											ret += '  <input type="hidden" name="selected_key" id="selected_key" value="'+item.key+'"/>' + "\n";
											ret += '  <input type="hidden" name="selected_field" id="selected_field" value="active"/>' + "\n";
											ret += '  <input type="hidden" name="set_value" id="set_value" value="false"/>' + "\n";
											ret += '  <input type="hidden" name="duplicate_key" id="duplicate_key" value="'+this_date_items[dup_index].key+'"/>' + "\n";
											ret += '  <input type="hidden" name="duplicate_time" id="duplicate_time" value="'+this_date_items[dup_index].tmp.time+'"/>' + "\n";
											ret += '  <input type="hidden" name="duplicate_date" id="duplicate_date" value="'+this_date_items[dup_index].tmp.date+'"/>' + "\n";
											var dup_msg = 'Mark as Duplicate<br/>of '+this_date_items[dup_index].tmp.date+' '+this_date_items[dup_index].tmp.time;
											if (fun.visual_debug_enable) dup_msg = 'Mark dated '+item.tmp.date+' <br/>Duplicate of '+this_date_items[dup_index].tmp.date+'<br/>(actual dup '+this_date_items[dup_index].key+': '+this_date_items[dup_index].ctime.substring(0,10)+') '+this_date_items[dup_index].tmp.time;
											if (item.hasOwnProperty("stated_date") || item.hasOwnProperty("stated_time")) //ret += '<div class="alert alert-info">see duplicate: '+this_date_items[dup_index].tmp.date+' '+this_date_items[dup_index].tmp.time+'</div>';
												ret += '  <button class="btn btn-info" type="submit">override as duplicate<br/>of '+this_date_items[dup_index].tmp.date+' '+this_date_items[dup_index].tmp.time+'</button>' + "\n";
											else ret += '  <button class="btn btn-warning" type="submit">'+dup_msg+'</button>' + "\n";
											//Mark '+item_key+':'+item.tmp.date+' Duplicate of '+this_date_items[dup_index].tmp.date+' (actual '+dup_index+': '+this_date_items[dup_index].ctime.substring(0,10)+') '+this_date_items[dup_index].tmp.time+'
											ret += '</form>' + "\n";
										}

										if (item_enable) {
											if (hdv_item_splitter_name && (column_name==hdv_item_splitter_name)) {
												var subvalues = fun.get_human_delimited_values(item[hdv_item_splitter_name]);
												if (subvalues && (subvalues.length>1)) {

													var split_enable = true;
													var hdv_paired_name = null;
													if (has_setting(unit, section+".list_implies_multiple_entries_paired_with")) hdv_paired_name = peek_setting(unit, section+".list_implies_multiple_entries_paired_with");
													if (hdv_paired_name!==null) {
														var co_subvalues = fun.get_human_delimited_values(item[hdv_paired_name]); //TODO: if differs, DON'T offer split!
														if (co_subvalues!==null) {
															if (co_subvalues.length==1) {
																ret += '<div class="alert alert-warning">implies multiple but "'+hdv_paired_name+'" does not.</div>';
																//split_enable = false;
															}
														}
														else {
															ret += '<div class="alert alert-warning">implies multiple but "'+hdv_paired_name+'" is missing.</div>';
															split_enable = false;
														}
														if ((subvalues.length==2) && (item[hdv_item_splitter_name].indexOf(",")<=-1) && (item[hdv_item_splitter_name].indexOf("&")<=-1) &&
															(item[hdv_item_splitter_name].indexOf("+")<=-1) && (item[hdv_item_splitter_name].indexOf(" and ")<=-1)
														) { //only treat as possibly one person if has no splitters other than space
															ret += '<form id="change-microevent-field" action="' + config.proxy_prefix_then_slash + 'change-microevent-field" method="post">' + "\n";
															ret += '  <input type="hidden" name="scroll_to_named_a" id="scroll_to_named_a" value="'+a_name+'"/>' + "\n";
															ret += '  <input type="hidden" name="unit" id="unit" value="'+unit+'"/>' + "\n";
															ret += '  <input type="hidden" name="section" id="section" value="'+section+'"/>' + "\n";
															ret += '  <input type="hidden" name="category" id="category" value="'+category+'"/>' + "\n";
															ret += '  <input type="hidden" name="dataset_name" id="dataset_name" value="'+dataset_name+'"/>' + "\n";
															ret += '  <input type="hidden" name="mode" id="mode" value="'+mode+'"/>' + "\n";
															ret += '  <input type="hidden" name="selected_year" id="selected_year" value="'+item.tmp.year+'"/>' + "\n";
															ret += '  <input type="hidden" name="selected_month" id="selected_month" value="'+item.tmp.month+'"/>' + "\n";
															ret += '  <input type="hidden" name="selected_day" id="selected_day" value="'+item.tmp.day+'"/>' + "\n";
															ret += '  <input type="hidden" name="selected_key" id="selected_key" value="'+item.key+'"/>' + "\n";
															ret += '  <input type="hidden" name="selected_field" id="selected_field" value="last_name"/>' + "\n"; //SET last_name
															ret += '  <input type="hidden" name="set_value" id="set_value" value="'+fun.split_capitalized(item[hdv_item_splitter_name],' ').join('')+'"/>' + "\n";
															ret += '  <button class="btn btn-warning" type="submit">Set to '+fun.split_capitalized(item[hdv_item_splitter_name],' ').join('')+'</button>' + "\n";
															ret += '</form>' + "\n";
														}
													}
													if (split_enable) {
														ret += '<form id="change-microevent-field" action="' + config.proxy_prefix_then_slash + 'split-entry" method="post">' + "\n";
														ret += '  <input type="hidden" name="scroll_to_named_a" id="scroll_to_named_a" value="'+a_name+'"/>' + "\n";
														ret += '  <input type="hidden" name="unit" id="unit" value="'+unit+'"/>' + "\n";
														ret += '  <input type="hidden" name="section" id="section" value="'+section+'"/>' + "\n";
														ret += '  <input type="hidden" name="category" id="category" value="'+category+'"/>' + "\n";
														ret += '  <input type="hidden" name="dataset_name" id="dataset_name" value="'+dataset_name+'"/>' + "\n";
														ret += '  <input type="hidden" name="mode" id="mode" value="'+mode+'"/>' + "\n";
														ret += '  <input type="hidden" name="selected_year" id="selected_year" value="'+item.tmp.year+'"/>' + "\n";
														ret += '  <input type="hidden" name="selected_month" id="selected_month" value="'+item.tmp.month+'"/>' + "\n";
														ret += '  <input type="hidden" name="selected_day" id="selected_day" value="'+item.tmp.day+'"/>' + "\n";
														ret += '  <input type="hidden" name="selected_key" id="selected_key" value="'+item.key+'"/>' + "\n";
														ret += '  <input type="hidden" name="selected_field" id="selected_field" value="'+column_name+'"/>' + "\n";
														//ret += '  <input type="hidden" name="set_value" id="set_value" value="'++'"/>' + "\n";
														ret += '  <input type="hidden" name="expected_count" id="expected_count" value="'+subvalues.length+'"/>' + "\n";
														ret += '  <button class="btn btn-danger" type="submit">Split into '+subvalues.length+' entries</button>' + "\n";
														ret += '</form>' + "\n";
													}
												}
											}
											else if (fun.is_blank(item[column_name]) && hdv_field_name && (column_name=="qty")) {

												var hdv_subvalues = null;
												if (hdv_item_splitter_name) hdv_subvalues = fun.get_human_delimited_values(item[hdv_item_splitter_name]);
												if (!hdv_subvalues || hdv_subvalues.length==1) { //only use qty if no splitter overrides qty
													var hdvs = fun.get_human_delimited_values(item[hdv_field_name]);
													if (hdvs && hdvs.length>1) {
														ret += '<form id="change-microevent-field" action="' + config.proxy_prefix_then_slash + 'change-microevent-field" method="post">' + "\n";
														ret += '  <input type="hidden" name="scroll_to_named_a" id="scroll_to_named_a" value="'+a_name+'"/>' + "\n";
														ret += '  <input type="hidden" name="unit" id="unit" value="'+unit+'"/>' + "\n";
														ret += '  <input type="hidden" name="section" id="section" value="'+section+'"/>' + "\n";
														ret += '  <input type="hidden" name="category" id="category" value="'+category+'"/>' + "\n";
														ret += '  <input type="hidden" name="dataset_name" id="dataset_name" value="'+dataset_name+'"/>' + "\n";
														ret += '  <input type="hidden" name="mode" id="mode" value="'+mode+'"/>' + "\n";
														ret += '  <input type="hidden" name="selected_year" id="selected_year" value="'+item.tmp.year+'"/>' + "\n";
														ret += '  <input type="hidden" name="selected_month" id="selected_month" value="'+item.tmp.month+'"/>' + "\n";
														ret += '  <input type="hidden" name="selected_day" id="selected_day" value="'+item.tmp.day+'"/>' + "\n";
														ret += '  <input type="hidden" name="selected_key" id="selected_key" value="'+item.key+'"/>' + "\n";
														ret += '  <input type="hidden" name="selected_field" id="selected_field" value="qty"/>' + "\n"; //SET qty
														ret += '  <input type="hidden" name="set_value" id="set_value" value="'+hdvs.length+'"/>' + "\n";
														ret += '  <button class="btn btn-warning" type="submit">Set to '+hdvs.length+'</button>' + "\n";
														ret += '</form>' + "\n";
													}
												}
											}

											if (fun.is_blank(item[column_name])) {
												if (has_setting(unit, section+"."+mode+".suggest_missing_required_fields_enable")) {
													if (fun.is_true(peek_setting(unit, section+"."+mode+".suggest_missing_required_fields_enable"))) {
														//if is an autofill requirement and is blank suggest value based on remaining fields:
														if (has_setting(unit, section+".autofill_requires")) {
															for (var requirer in _settings[section].autofill_requires) {
																var requirements = _settings[section].autofill_requires[requirer];
																if (requirements.length>1) {
																	//console.log("[ ] verbose message: found requirements "+JSON.stringify(requirements));
																	var my_index = fun.array_index_of(requirements, column_name);
																	if (my_index>-1) {  // if (requirements.hasOwnProperty(column_name)) { //hasOwnProperty doesn't work
																		if (section in autofill_cache) {
																			if (requirer in autofill_cache[section]) {
																				var suggested_values = [];
																				for (var combined_primary_key in autofill_cache[section][requirer]) {
																					match_count=0;
																					var suggested_val=null;
																					var good_values = combined_primary_key.split("+");
																					//var debug_stack = [];
																					for (var gv_i=0; gv_i<good_values.length; gv_i++) {
																						//NOTE: gv_i should be exactly the same index in requirements since autofill_cache entries are based on requirements array
																						if (gv_i==my_index) {
																							suggested_val = good_values[gv_i];
																							var last_irregular_values = null;
																							if (has_setting(unit, section+".autofill_equivalents."+column_name)) {
																								var irregular_values_lists = peek_setting(unit, section+".autofill_equivalents."+column_name);
																								for (var normal_value_as_key in irregular_values_lists) {
																									if (suggested_val.toLowerCase()==normal_value_as_key.toLowerCase() &&
																										suggested_val!=normal_value_as_key)
																										suggested_val=normal_value_as_key; //convert case of cache to expected case
																									var irregular_value_index = fun.array_index_of(irregular_values_lists[normal_value_as_key], suggested_val);
																									last_irregular_values = irregular_values_lists[normal_value_as_key];
																									if (irregular_value_index>-1) {
																										suggested_val = normal_value_as_key;
																										break;
																									}
																								}
																								//console.log("[ ]   verbose message: suggested value is "+suggested_val+" for "+column_name+" in "+item.key+" (has "+JSON.stringify(fun.get_row(item,requirements))+")");
																								//if (suggested_val!=good_values[gv_i]) console.log("        (normalized from "+good_values[gv_i]+")");
																								//else console.log("        (same as cache since is "+suggested_val+" not in irregular values "+JSON.stringify(last_irregular_values)+")");
																							}
																							//else don't try to make normal--field has no good value array of equivalent values
																						}
																						else {
																							if ((requirements[gv_i] in item) && fun.is_not_blank(item[requirements[gv_i]])) {
																								if ((typeof item[requirements[gv_i]])=="string") {
																									if (item[requirements[gv_i]].toLowerCase()==good_values[gv_i]) {
																										match_count++;
																									}
																									//else suggested_val = good_values[gv_i];
																								}
																								else {
																									if (item[requirements[gv_i]]==good_values[gv_i]) {
																										match_count++;
																									}
																								}
																								//debug_stack.push(item[requirements[gv_i]]);
																							}
																							else {
																								//Do nothing. Form validation must not have been working (so required field is missing in saved data).
																								//suggested_val = good_values[gv_i];
																								//NOTE: d_path is not set here by user, only manually by metadata added during preprocessing in this method!
																								//console.log("[ ]   ERROR: no "+requirements[gv_i]+" in item "+item_path); //+" only "+JSON.stringify(item)
																							}
																						}
																					}
																					if (match_count>=requirements.length-1) { //if only missing one value
																						if (!fun.array_contains(suggested_values, suggested_val)) {
																							ret += '<form id="change-microevent-field" action="' + config.proxy_prefix_then_slash + 'change-microevent-field" method="post">' + "\n";
																							ret += '  <input type="hidden" name="scroll_to_named_a" id="scroll_to_named_a" value="'+a_name+'"/>' + "\n";
																							ret += '  <input type="hidden" name="unit" id="unit" value="'+unit+'"/>' + "\n";
																							ret += '  <input type="hidden" name="section" id="section" value="'+section+'"/>' + "\n";
																							ret += '  <input type="hidden" name="category" id="category" value="'+category+'"/>' + "\n";
																							ret += '  <input type="hidden" name="dataset_name" id="dataset_name" value="'+dataset_name+'"/>' + "\n";
																							ret += '  <input type="hidden" name="mode" id="mode" value="'+mode+'"/>' + "\n";
																							ret += '  <input type="hidden" name="selected_year" id="selected_year" value="'+item.tmp.year+'"/>' + "\n";
																							ret += '  <input type="hidden" name="selected_month" id="selected_month" value="'+item.tmp.month+'"/>' + "\n";
																							ret += '  <input type="hidden" name="selected_day" id="selected_day" value="'+item.tmp.day+'"/>' + "\n";
																							ret += '  <input type="hidden" name="selected_key" id="selected_key" value="'+item.key+'"/>' + "\n";
																							ret += '  <input type="hidden" name="selected_field" id="selected_field" value="'+column_name+'"/>' + "\n"; //SET missing required field
																							ret += '  <input type="hidden" name="set_value" id="set_value" value="'+suggested_val+'"/>' + "\n";
																							ret += '  <button class="btn btn-warning" type="submit">Set to '+suggested_val+'</button>' + "\n";
																							ret += '</form>' + "\n";
																							suggested_values.push(suggested_val);
																						}
																					}
																					//else console.log("[ ]   verbose message: "+JSON.stringify(debug_stack)+" is not enough like good values "+JSON.stringify(good_values));
																				}
																				match_count = null;  // out of scope
																			}
																			else {
																				if (show_no_requirer_for_section_warning_enable) {
																					console.log("[ ]   WARNING: nothing to suggest since no "+requirer+" for "+section+" in autofill_cache");
																					show_no_requirer_for_section_warning_enable = false;
																				}
																			}
																		}
																		else {
																			if (show_autofill_yet_in_section_warning_enable) {
																				console.log("[ ]   WARNING: nothing to suggest since no "+section+" in autofill_cache");
																				show_autofill_yet_in_section_warning_enable = false;
																			}
																		}
																		//console.log("[ ]   verbose message: done looking in requirements since examined "+column_name);
																		break;
																	}
																	//else console.log("[ ]   verbose message: "+column_name+" is not required for autofill of "+requirer);
																}
																//else console.log("[ ]                  verbose message: there are not enough requirements for a sibling requirement's value to be suggested");
															}
														}
														else {
															if (no_autofill_requires_in_section_warning_enable) {
																console.log("[ ] WARNING: nothing to suggest since no autofill_requires for "+section);
																no_autofill_requires_in_section_warning_enable = false;
															}
														}
													}
													else console.log("[ ] verbose message: suggestion of missing required values is not enabled");
												}
												else console.log("[ ] WARNING: missing setting "+section+"."+mode+".suggest_missing_required_fields_enable");
											}
										}

										if (!item_enable) {
											ret += '</span>' + "\n";
											if ((ssf_i===0) && ("duplicate_of_time" in item)) ret+='<span class="text-muted"> see '+item.duplicate_of_time;
										}
										if (column_name=="=get_date_from_path()") {
											if (item.tmp["=get_date_from_path()"] != item.tmp.date) {
												//ret+='<div class="alert alert-danger">'+item.tmp.date+'</div>';
												ret += '<form id="change-microevent-field" action="' + config.proxy_prefix_then_slash + 'change-microevent-field" method="post">' + "\n";
												ret += '  <input type="hidden" name="scroll_to_named_a" id="scroll_to_named_a" value="'+a_name+'"/>' + "\n";
												ret += '  <input type="hidden" name="unit" id="unit" value="'+unit+'"/>' + "\n";
												ret += '  <input type="hidden" name="section" id="section" value="'+section+'"/>' + "\n";
												ret += '  <input type="hidden" name="category" id="category" value="'+category+'"/>' + "\n";
												ret += '  <input type="hidden" name="dataset_name" id="dataset_name" value="'+dataset_name+'"/>' + "\n";
												ret += '  <input type="hidden" name="mode" id="mode" value="'+mode+'"/>' + "\n";
												ret += '  <input type="hidden" name="selected_year" id="selected_year" value="'+item.tmp.year+'"/>' + "\n";
												ret += '  <input type="hidden" name="selected_month" id="selected_month" value="'+item.tmp.month+'"/>' + "\n";
												ret += '  <input type="hidden" name="selected_day" id="selected_day" value="'+item.tmp.day+'"/>' + "\n";
												ret += '  <input type="hidden" name="selected_key" id="selected_key" value="'+item.key+'"/>' + "\n";
												ret += '  <input type="hidden" name="selected_field" id="selected_field" value="ctime"/>' + "\n"; //SET ctime
												ret += '  <input type="hidden" name="set_value" id="set_value" value="'+item.ctime.replaceAll(item.tmp.date,item.tmp["=get_date_from_path()"])+'"/>' + "\n";
												ret += '  <button class="btn btn-warning" type="submit">Repair ctime as '+item.tmp["=get_date_from_path()"]+'</button>' + "\n";
												ret += '</form>' + "\n";
											}
										}

										ret += '</td>' + "\n";
									}
									ret += '    </tr>' + "\n";
								}
								ret += '  </tbody>' + "\n";
								ret += '</table>' + "\n";
								ret += '<div class="alert alert-info">'+'finished reading '+items.length+' item(s)'+'</div>';
								if (parsing_info.length>0) ret += '<div class="alert alert-info">'+parsing_info+'</div>';
								if (parsing_error.length>0) ret += '<div class="alert alert-error">'+parsing_error+'</div>';
							}
							else ret += '<div class="alert alert-info">'+'There is no table '+dataset_name+' in section ' + section + '.' + '</div>';
						}
						else {
							if (selected_year) { //if no month selected, but does have year, show Billing Cycle Designer aka billing-cycle but this is not a route for downloading a csv
								if (user_has_section_permission(unit, username, section, "billing")) {
									var auto_select_month_enable = true;
									if (has_setting(unit, section+"."+mode+".auto_select_month_enable")) auto_select_month_enable = peek_setting(unit, section+"."+mode+".auto_select_month_enable");
									//This is not really going to auto select, but true can imply that the user expectation is to see a month (see next line)
									//if (auto_select_month_enable) ret += "(select a month)<br/>";  // they probably want a month if auto select is enabled
									//else
									//ret += "(to exit billing and to edit entries, select a month above)<br/><br/>"+"\n";  // they probably want a month if auto select is enabled
									if (container_enable=="true") ret += '<div class="container">' + "\n";
									else {
										ret += "</div><!--force end container-->";
										ret += '<div class="container"><!--force end container-->';
									}
									ret += '<div class="row">' + "\n";
									ret += ' <div class="col-sm-4">' + "\n";
									ret += "   <h4>Billing Cycle Designer</h4><br/>"+"\n";  // they probably want a month if auto select is enabled
									//var months = [];
									//NOTE: months is already a param given to this helper
									//var sub_months = [];
									var items_category = "transactions";
									dataset_path = get_dataset_path_if_exists_else_null(unit, section, items_category, dataset_name, false);
									if (dataset_path !== null) {
										y_path = dataset_path + "/" + selected_year;
										var y_i = parseInt(selected_year);
										if (y_i===y_i) { //only not equal to itself if NaN
											if (y_i<1940) console.log("WARNING: year detected ("+y_i+", from string value "+selected_year+") is before 1940");
											var prev_y_path = dataset_path + "/" + (y_i-1);  // in case we need to bill for monday or more days in previous year (on first Friday of selected_year)
											var prev_year_m_path = prev_y_path + "/" + "12";
											//sub_months = fun.getVisibleDirectories(y_path);
											var bill_dow = 5; //1 is monday, 5 is friday
											var bill_source_msg = "";
											if (has_setting(unit, section+".bill_iso_day_of_week")) {
												bill_dow = parseInt(peek_setting(unit, section+".bill_iso_day_of_week"));
												bill_source_msg = " from settings";
											}
											if (bill_dow>=1 & bill_dow<=7) {
												ret += '    <script>' + "\n";
												ret += '    function submit_new_cycle() {' + "\n";
												ret += '      document.getElementById("add-end-dates-to-bill").submit()' + "\n";
												ret += '    }' + "\n";
												ret += '    </script>' + "\n";
												ret += '    <form class="form" id="add-end-dates-to-bill" action="' + config.proxy_prefix_then_slash + 'add-end-dates-to-bill" method="post">' + "\n";
												ret += '      <div class="form-group">' + "\n";
												//ret += '        <div class="entry form-group col-sm-6">' + "\n"; //input-group mb-2 mr-sm-2 mb-sm-0

												//ret += '          <div class="input-group-addon" >New Billing Cycle Name:</div>';
												//ret += '            <label for="new_cycle_name">New Cycle Name:</label>' + "\n";
												//ret += '            <input type="text" class="form-control" name="new_cycle_name" id="new_cycle_name" value=""/>' + "\n";
												//ret += '          </div>' + "\n";
												//ret += '          <div class="form-group col-4">' + "\n"; //input-group mb-2 mr-sm-2 mb-sm-0
												//ret += '            <button type="submit" class="btn btn-primary">Create from Selected Weeks</button>' + "\n";
												//ret += '          </div">';
												//ret += '        </div>' + "\n";//end col

												ret += '          <div class="input-group">';
												ret += '            <input type="text" class="form-control" name="new_cycle_name" placeholder="New Cycle Name">' + "\n";
												ret += '            <span class="input-group-btn">' + "\n";
												ret += '            <button class="btn btn-success btn-add" type="button" onclick="submit_new_cycle()"><span class="glyphicon glyphicon-plus"></span></button>' + "\n";
												ret += '            </span>' + "\n";
												ret += '          </div>' + "\n";
												ret += '      </div>' + "\n";//end form-group
												ret += '      <input type="hidden" name="selected_year" value="'+selected_year+'"/>' + "\n";
												ret += '      <input type="hidden" name="unit" id="unit" value="'+unit+'"/>' + "\n";
												ret += '      <input type="hidden" name="section" id="section" value="'+section+'"/>' + "\n";
												ret += '      <input type="hidden" name="category" id="category" value="'+category+'"/>' + "\n";
												ret += '      <input type="hidden" name="dataset_name" id="dataset_name" value="'+dataset_name+'"/>' + "\n";
												ret += '      <input type="hidden" name="mode" value="'+mode+'"/>' + "\n";
												for (var m_i=12; m_i>=1; m_i--) {
													var m_s = fun.zero_padded(m_i, 2);
													for (var d_i=31; d_i>=1; d_i--) {
														var d_s = fun.zero_padded(d_i, 2);
														var folder_date = moment(selected_year+"-"+m_s+"-"+d_s);
														var this_dow = folder_date.day(); //where 1 is monday and 5 is friday
														if (this_dow==bill_dow) {
															//ret += "bill on "+folder_date.format('dddd')+' '+folder_date.format("dddd MMM D, Y")+' for:<br/>' + "\n";//debug only
															var used_days_count = 0;
															for (var d_backstep=0; d_backstep<7; d_backstep++) {
																var back_dow_i = this_dow-d_backstep;
																if (back_dow_i<=0) back_dow_i += 7;
																var back_d_i = d_i-d_backstep;
																var back_m_i = m_i;
																var back_y_i = y_i;
																var back_dim = folder_date.daysInMonth();
																var back_y_s = fun.zero_padded(back_y_i, 4); //does convert to string
																var back_m_s = fun.zero_padded(back_m_i, 2);
																if (back_d_i<=0) {
																	//example: 2016-01-01 is a Friday, so to bill for Mon-Fri, go back a year (for only dow 1-4 aka Mon-Thurs)
																	back_m_i = m_i - 1;
																	if (back_m_i<=0) {
																		back_y_i = y_i - 1;
																		back_y_s = fun.zero_padded(back_y_i, 4);
																		back_m_i = 12;
																	}
																	back_m_s = fun.zero_padded(back_m_i, 2);
																	back_dim = moment(back_y_i+"-"+back_m_s, "YYYY-MM").daysInMonth();
																	back_d_i += back_dim; //add since back_d_i is negative in this case
																}
																var back_d_s = fun.zero_padded(back_d_i, 2);
																var back_d_path = dataset_path + "/" + back_y_s + "/" + back_m_s + "/" + back_d_s;
																var back_date_s = back_y_s+"-"+back_m_s+"-"+back_d_s;
																var back_date = moment(back_date_s, "YYYY-MM-DD");
																//NOTE: back_d_path could be same as before, if is friday (if d_backstep is 0)
																if (fs.existsSync(back_d_path)) {
																	//ret += '* '+back_date.format("dddd MMM D, Y")+'<br/>' + "\n";//debug only
																	used_days_count++;
																}
																else {
																	//ret += '* <span style="color:gray">'+back_date.format("dddd MMM D, Y")+'</span><br/>' + "\n";//debug only
																}
															}
															if (used_days_count>0) {
																ret += '      <div class="form-check">' + "\n";
																ret += '        <label class="form-check-label">' + "\n";
																ret += '          <input type="checkbox" class="form-check-input" name="form_bill_for_'+folder_date.format("YYYYMMDD")+'">' + "\n"; //returns 'on' or 'off'
																ret += '          '+folder_date.format('dddd')+' '+folder_date.format("MMM D, Y")+'<br/>' + "\n";
																ret += '        </label>' + "\n";
																ret += '      </div>' + "\n";
															}
														}//end if bill_dow
													}//end for day
													//NOTE: folder_date is out of scope
												}//end for month
												ret += '    </form>' + "\n";
											}
											else ret += '  <div class="alert alert-warning">Day of Week for billing must be 1-7 where 1 is Monday, but value'+bill_source_msg+' was "'+bill_dow+'".</div>';
											ret += ' </div><!--end col-->' + "\n";

											//ret += ' <div class="col-sm-2">' + "\n";
											//ret += ' </div><!--end col-->' + "\n";

											ret += ' <div class="col-sm-6 col-sm-offset-2">' + "\n";
											ret += get_billing_cycle_selector(unit, section, category, "BillingCycle", selected_year, selected_month, selected_day, selected_number);
										}
										else ret += '  <div class="alert alert-warning">selected year "'+selected_year+'" is not a number, so report is not possible on this folder.</div>';
										ret += ' </div><!--end col-->' + "\n";
										ret += '</div><!--end row-->' + "\n";
										if (container_enable=="true") ret += '</div><!--end billing container-->' + "\n";
									}
									else ret += '  <div class="alert alert-warning">failed to find folder for '+section+' '+category+' '+dataset_name+'</div>';
								}
								//else no billing permission
							}
							else ret += "(select a year or month)<br/>"+"\n";
						}
						//ret += '</div>';//end "panel-body"
						//ret += '</div>';//end "panel panel-default"
					}
					else ret += "There is no sheet defined for "+section+".";
				}
				else {
					ret += 'You do not have permission to access '+mode+' in this section' + "\n";
				}
			} //end if table_enable
			else {
				ret += '  <div class="alert alert-warning">ERROR in show_reports (table_info.error): '+table_info.error+' for '+unit+"/"+section+"/"+category+"/"+dataset_name+'</div>';
			}
			//else error already shown
			return new Handlebars.SafeString(ret);
		},  //end show_reports
		get_section_form: function(unit, section, category, dataset_name, mode, username, prefill, missing_fields, opts) {
			//aka get_form
			//globals of note:
			//prefill_data_by_user
			//category="transactions";
			//dataset_name="student";
			if (!prefill) {
				prefill={}; //prevent crashes related to "in" keyword
				console.log("WARNING: prefill was false in get_section_form");
			}
			var ret = "No form implemented ("+section+")";
			if (has_setting(unit, section+".form_fields")) {
				//console.log("get_section_form...");
				//for (var index in prefill) {
				//    if (prefill.hasOwnProperty(index)) {
				//        console.log("_ (get_section_form) prefill."+index + " is in session with value "+prefill[index]);
				//    }
				//}
				ret = "\n"+'<form class="form-horizontal" id="student-microevent" action="' + config.proxy_prefix_then_slash + 'student-microevent" method="post">' + "\n";

				ret += '  <input type="hidden" name="unit" id="unit" value="'+unit+'"/>' + "\n";
				ret += '  <input type="hidden" name="section" id="section" value="'+section+'"/>' + "\n";
				ret += '  <input type="hidden" name="category" id="category" value="'+category+'"/>' + "\n";
				ret += '  <input type="hidden" name="dataset_name" id="dataset_name" value="'+dataset_name+'"/>' + "\n";
				if (!(prefill.hasOwnProperty("mode"))) {
					ret += '  <input type="hidden" name="mode" id="mode" value="create"/>' + "\n";
				}
				else {
					ret += '  <input type="hidden" name="mode" id="mode" value="'+prefill.mode+'"/>' + "\n";
				}
				//var section_form_fields = peek_setting(unit, section+".form_fields");
				//for (index in section_form_fields) {
				ret += get_filtered_form_fields_html(unit, section, mode, username, false, prefill, missing_fields);
				ret += '  <div class="form-group">' + "\n";
				ret += '    <div class="col-sm-10" style="text-align:center">' + "\n";
				var friendly_action_name = "Enter";
				if (mode && (friendly_mode_action_text.hasOwnProperty(mode))) friendly_action_name=friendly_mode_action_text[mode];
				ret += '      <button type="submit" class="btn btn-primary btn-sm">'+friendly_action_name+'</button>' + "\n";
				var more_fields_html = get_filtered_form_fields_html(unit, section, mode, username, true, prefill, missing_fields);
				if (more_fields_html.length>0) ret += '      <a data-toggle="collapse" href="#extra-fields" class="btn btn-default btn-md" role="button">More Options</a>' + "\n";
				ret += '    </div>' + "\n";
				ret += '  </div>' + "\n";
				if (more_fields_html.length>0) {
					ret += '  <div name="extra-fields" class="collapse" id="extra-fields">' + "\n";
					ret += more_fields_html;
					ret += '  </div>' + "\n";
				}
				ret += "\n  </form>"+"\n";
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
		user_has_pinless_time: function(unit, section, username, opts) {
			if (user_has_pinless_time(unit, section, username)) // Or ===
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
		createGroupContains: function(unit, section, username, opts) {
			if (user_has_section_permission(unit, username, section, "create"))
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
		readGroupContains: function(unit, section, username, opts) {
			if (user_has_section_permission(unit, username, section, "read"))
				return opts.fn(this);
			else
				return opts.inverse(this);
		},
		modifyGroupContains: function(unit, section, username, opts) {
			if (user_has_section_permission(unit, username, section, "modify"))
				return opts.fn(this);
			else
				return opts.inverse(this);
		},
		reportsGroupContains: function(unit, section, username, opts) {
			if (user_has_section_permission(unit, username, section, "reports"))
				return opts.fn(this);
			else
				return opts.inverse(this);
		},
		friendlyModeName: function(unit, needle, opts) {
			if (friendly_mode_names.hasOwnProperty(needle))
				return friendly_mode_names[needle];
			else
				return needle;
		},
		friendlySectionName: function(unit, needle, opts) {
			if (has_setting(unit, needle+".display_name"))
				return peek_setting(unit, needle+".display_name");
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
		is_after_school: function(unit, section, opts) {
			if (!section) console.log("ERROR: no section given to is_after_school helper");
			if (has_setting(unit, section+".local_end_time")) {
				var local_time_zone = null;
				if (has_setting(unit, "unit.local_time_zone")) local_time_zone = peek_setting(unit, "unit.local_time_zone");
				//if (Date.format("HH:mm:ss") > Date.parse("15:05:00"))
				var local_now = moment();
				if (local_time_zone!==null) local_now = moment().tz(local_time_zone);
				else console.log("ERROR: missing unit.local_time_zone setting during is_after_school helper");
				//old way (doesn't work for some reason--can't find current timezone from os) local_now.local();
				var now_date_string = local_now.format("YYYY-MM-DD");
				var currentTimeString = local_now.format("HH:mm:ss");  // moment('11:00p', "HH:mm a");
				var tmp_local_end_date = now_date_string+" "+peek_setting(unit, section+".local_end_time");
				//console.log("tmp_local_end_date:"+tmp_local_end_date);
				var endTime = moment(tmp_local_end_date); //, "HH:mm:ss"; // var endTime = moment(_settings[section].local_end_time, "HH:mm:ss");
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
		is_before_school: function(unit, section, opts) {
			if (!section) console.log("ERROR: no section given to is_before_school helper");
			if (has_setting(unit, section+".local_start_time")) {
				var local_time_zone = null;
				if (has_setting(unit, "unit.local_time_zone")) local_time_zone = peek_setting(unit, "unit.local_time_zone");
				//else console.log("ERROR: missing unit.local_time_zone setting during is_before_school helper");
				//if (Date.format("HH:mm:ss") > Date.parse("15:05:00"))
				var local_now = moment();
				if (local_time_zone!==null) local_now = moment().tz(local_time_zone);
				else console.log("ERROR: null unit.local_time_zone setting during is_before_school helper");
				var now_date_string = local_now.format("YYYY-MM-DD");
				var currentTimeString = local_now.format("HH:mm:ss");  // moment('11:00p', "HH:mm a");
				var tmp_local_start_date = now_date_string+" "+peek_setting(unit, section+".local_start_time");
				//console.log("tmp_local_start_date:"+tmp_local_start_date);
				var startTime = moment(tmp_local_start_date); //, "HH:mm:ss" // var endTime = moment(_settings[section].local_end_time, "HH:mm:ss");
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
		get_primary_dataset_name: function(unit, section, opts) {
			var dataset_name = null;
			if (has_setting(unit, section+".primary_dataset_name")) {
				dataset_name=peek_setting(unit, section+".primary_dataset_name");
			}
			return dataset_name;
		},
		get_primary_category: function(unit, section, opts) {
			var category = null;
			if (has_setting(unit, section+".primary_category")) {
				category=peek_setting(unit, section+".primary_category");
			}
			return category;
		},
		get_tz_offset_mins: function(opts) {
			return moment().utcOffset();
		},
		//get_startup_js_code: function(opts) {
		//	return session.runme;
		//},
		show_status: function(unit, section, dataset_name, opts) {
			var ret="";
			if (fun.array_contains(tracking_sections, section)) {
				var category = "status";
				var found = false;
				//TODO: why are labels centered?
				ret += '<form class="form-horizontal" id="test-update" action="' + config.proxy_prefix_then_slash + 'tp" method="post">';
				ret += '  <input type="hidden" name="unit" id="unit" value="'+unit+'"/>' + "\n";
				ret += '  <input type="hidden" name="section" id="section" value="'+section+'"/>' + "\n";
				ret += '  <input type="hidden" name="category" id="category" value="'+category+'"/>' + "\n";
				ret += '  <input type="hidden" name="dataset_name" id="dataset_name" value="'+dataset_name+'"/>' + "\n";
				ret += '  <input type="hidden" name="mode" id="mode" value="create"/>' + "\n";
				ret += '  <div class="form-group">' + "\n";
				ret += '    <label class="control-label col-sm-2" >UserName:</label>' + "\n";
				ret += '    <div class="col-sm-10">' + "\n";
				ret += '      <input type="text" class="form-control" size="8" name="UserName" id="UserName" value=""/>' + "\n";
				ret += '    </div>' + "\n";
				ret += '  </div>' + "\n";
				ret += '  <div class="form-group">' + "\n";
				ret += '    <label class="control-label col-sm-2" >MachineName:</label>' + "\n";
				ret += '    <div class="col-sm-10">' + "\n";
				ret += '      <input type="text" class="form-control" size="8" name="MachineName" id="MachineName" value=""/>' + "\n";
				ret += '    </div>' + "\n";
				ret += '  </div>' + "\n";
				ret += '  <div class="form-group">' + "\n";
				ret += '    <label class="control-label col-sm-2" >HostName:</label>' + "\n";
				ret += '    <div class="col-sm-10">' + "\n";
				ret += '      <input type="text" class="form-control" size="8" name="HostName" id="HostName" value=""/>' + "\n";
				ret += '    </div>' + "\n";
				ret += '  </div>' + "\n";
				ret += '  <div class="form-group">' + "\n";
				ret += '    <label class="control-label col-sm-2" >MAC:</label>' + "\n";
				ret += '    <div class="col-sm-10">' + "\n";
				ret += '      <input type="text" class="form-control" size="8" name="MAC" id="MAC" value=""/>' + "\n";
				ret += '    </div>' + "\n";
				ret += '  </div>' + "\n";
				ret += '  <div class="form-group">' + "\n";
				ret += '    <label class="control-label col-sm-2" >Image:</label>' + "\n";
				ret += '    <div class="col-sm-10">' + "\n";
				ret += '      <input type="file" class="form-control" name="screenshot_file" id="screenshot_file"/>' + "\n";
				ret += '    </div>' + "\n";
				ret += '  </div>' + "\n";
				ret += '  <div class="form-group">' + "\n";
				ret += '    <button class="btn btn-default" type="submit">Test</button>' + "\n";
				ret += '</form>' + "\n";
				ret += '<br/>' + "\n";
				var ti = get_dataset_info(unit, section, category, dataset_name);
				if (ti.enable) {
					var tracked_count = 0;
					if (has_setting(unit, section+".status_keys")) {
						found = true;

						var status_keys = peek_setting(unit, section+".status_keys");
						ret += "<!--show_status: listing "+status_keys.length+" status_key(s) for "+section+"-->";
						var href = config.proxy_prefix_then_slash+"save-status?unit="+unit+"&section="+section+"&category="+category+"&dataset_name=dataset_name";//+url_params+"change_section_report_edit_field="+override_key;
						ret += '<a href="' + href + '">Save</a>' + "\n";
						for (var k_i=0; k_i<status_keys.length; k_i++) {
							var primary_key = status_keys[k_i];
							//item.tmp = {};
							//if (item.hasOwnProperty(primary_key)) {
							//item.tmp.key = item[primary_key];
							for (var id in fsc[unit][section].status[primary_key]) {
								ret+= '<p>'+JSON.stringify(fsc[unit][section].status[primary_key][id]).replaceAll(',',', ')+'</p><br/>' + "\n";
								//req.session.success = "tracking: "+JSON.stringify(item);
								//tracked_count++;
							}
							//}
						}
					}
					else ret += "<!--show_status: no status_keys for " + section + "-->";
				}
				else ret += "<!--show_status: " + ti.error + "-->";
				if (!found) ret += "There is no data from tracked devices yet. Try installing iedup binary on a Windows device (or via iedusm if release version is available).";
			}
			return new Handlebars.SafeString(ret);
		},
		show_history: function(unit, section, objects, opts) {
			var ret = "";
			var force_date_enable = false;
			if (has_setting(unit, section+".history_sheet_fields")) {
				var fields = peek_setting(unit, section+".history_sheet_fields");
				if (fields !== null) {
					var field_i;
					var f_len=fields.length;
					ret += '<table class="table">' + "\n";
					ret += '<thead class="thead-default">' + "\n";
					ret += "<tr>"+"\n";
					if (force_date_enable) ret += "<th>Date</th>";
					for (field_i=0; field_i<f_len; field_i++) {
						ret += "<th>"+"\n";
						ret += "<small>"+"\n";
						var key = fields[field_i];
						var name = key;
						var param_name = get_sheet_primary_param_name(key);
						if (param_name) {
							if (has_setting(unit, section+".sheet_display_names."+param_name))
								name = peek_setting(unit, section+".sheet_display_names."+param_name);
							else name = param_name;
						}
						else {
							var function_name = get_sheet_function_name(key);
							if (function_name) {
								var function_key = "="+function_name;
								if (has_setting(unit, section+".sheet_display_names."+function_key))
									name = peek_setting(unit, section+".sheet_display_names."+function_key);
							}
							else {
								if (has_setting(unit, section+".sheet_display_names."+key))
									name = peek_setting(unit, section+".sheet_display_names."+key);
							}
						}
						if (name) ret += name;
						else ret += "&nbsp;";
						ret += "</small>"+"\n";
						ret += "</th>"+"\n";
					}
					ret += "</tr>"+"\n";
					ret += '</thead">' + "\n";
					ret += '<tbody>' + "\n";
					var hdv_field_name = null;
					if (has_setting(unit, section+".list_implies_qty")) hdv_field_name = peek_setting(unit, section+".list_implies_qty");
					var hdv_item_splitter_name = null;
					if (has_setting(unit, section+".list_implies_multiple_entries")) hdv_item_splitter_name = peek_setting(unit, section+".list_implies_multiple_entries");
					var hdv_paired_name = null;
					if (has_setting(unit, section+".list_implies_multiple_entries_paired_with")) hdv_paired_name = peek_setting(unit, section+".list_implies_multiple_entries_paired_with");
					var hdv_or_single_name = null;
					if (has_setting(unit, section+".list_implies_multiple_entries_paired_with_unless_has_one")) hdv_or_single_name = peek_setting(unit, section+".list_implies_multiple_entries_paired_with_unless_has_one");
					//var len=objects.length;
					//var oops_i=0;
					//var hardcoded_limit_i=900;
					//for (var i=0; i<len; i++) { //NOTE: if i is used instead of var i, infinite loop occurs where i is always 4!
					for (var key in objects) {
						element = objects[key];
						//oops_i++;
						//if (oops_i>hardcoded_limit_i) {
						//	console.log("ERROR: executions over hardcoded_limit_i "+hardcoded_limit_i);
						//	break;
						//}
						ret += "<tr>"+"\n";
						if (("tmp" in element) && ("date" in element.tmp)) i_date = element.tmp.date;
						//if (i_date==null)
						if (force_date_enable) {
							ret += "<td>"+i_date+"</td>\n";
						}
						for (field_i=0; field_i<f_len; field_i++) {
							field_key = fields[field_i];
							ret += "<td>"+"\n";
							if (field_key.substring(0,1)=="=") {
								var formula = field_key;
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
												//var formula_result = params[0].substring(params[1]-1,params[2]); //+1 since sheet formulas use counting numbers; but don't add to last param since end is inclusive
												//ret += formula_result;
												if (element.hasOwnProperty(params[0])) {
													var hdvs = fun.get_human_delimited_values(element[params[0]]);
													var h_len=hdvs.length;
													if (h_len>1 && ( ((hdv_item_splitter_name!==null) && (params[0]==hdv_item_splitter_name)) ||
													               ((hdv_paired_name!==null) && (params[0]==hdv_paired_name)) ||
																   ((hdv_or_single_name!==null) && (params[0]==hdv_or_single_name)) ||
																   ((hdv_field_name!==null) && (params[0]==hdv_field_name))
																   )
													   ) {
														for (var h_i=0; h_i<h_len; h_i++) {
															ret += hdvs[h_i].substring(params[1]-1,params[2]) + (((h_i+1)!=h_len)?", ":"");
														}
													}
													else {
														ret += element[params[0]].substring(params[1]-1,params[2]);
													}
												}
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
							else if ( section_fields_overrides.hasOwnProperty(section) &&
							                                               section_fields_overrides[section].hasOwnProperty(field_key) &&
							                                               element.hasOwnProperty(section_fields_overrides[section][field_key]) &&
							                                               fun.is_not_blank(element[section_fields_overrides[section][field_key]]) ) {
								ret += element[section_fields_overrides[section][field_key]];
							}
							else if (element.hasOwnProperty(field_key)) {
								ret += element[field_key];
							}
							else ret += "&nbsp;";//"[?<!--"+field_key+"-->]";
							ret += "</td>";
						}
						ret += "</tr>"+"\n";
					}
					ret += '</tbody>' + "\n";
					ret += "</table>"+"\n";
					//ret += len  + "object(s) in "+JSON.stringify(objects);
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
function check_settings() {
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
}

// default route "/"
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
	check_settings();
	if (req.method=='PUT' || req.method=='POST') {
		console.log("ERROR: bad method " + req.method + " in route /");
	}

	var user_sections = [];
	var user_modes_by_section = {};
	var years = [];
	var months = [];
	var days = [];
	var item_keys = []; // the associative array keys for accessing objects in the day
	var items = []; //the entries
	var unit = null;
	var section = null; //selected section
	var category = null;
	var dataset_name = null;
	var mode = null; //selected mode
	var selected_month = null;
	var selected_year = null;
	var selected_day = null;
	var selected_number = null;
	var selected_item_key = null;
	var this_sheet_field_names = [];
	var this_sheet_field_friendly_names = [];
	if (!(req.session.hasOwnProperty("prefill"))) req.session.prefill={};
	if (req.query.hasOwnProperty("unit")) {
		unit = req.query.unit;
	}
	else {
		unit = "0";
	}
	if (req.user && req.user.username) {
		var preload_dataset_names = [];
		if (!has_setting(unit, "unit.enabled_sections")) {
			console.log("[ route / ] ERROR: missing required array unit.enabled_sections in unit " + unit + " (this should never happen)");
		}
		else {
			preload_dataset_names = peek_setting(unit, "unit.enabled_sections");
			if (preload_dataset_names.length < 1) {
				console.log("[ route / ] ERROR: 0-length required array unit.enabled_sections in unit " + unit + " (this should never happen)");
			}
		}
		for (var index in preload_dataset_names) {
			if (preload_dataset_names.hasOwnProperty(index)) {
				var val = preload_dataset_names[index];
				if ( user_has_section_permission(unit, req.user.username, val, "create") || user_has_section_permission(unit, req.user.username, val, "read") || user_has_section_permission(unit, req.user.username, val, "modify") ) {
					user_sections.push(val);
					if (!user_modes_by_section.hasOwnProperty(val)) user_modes_by_section[val] = [];
					if (has_setting(unit, "unit.selectable_modes")) {
						var selectable_modes = peek_setting(unit, "unit.selectable_modes");
						if (selectable_modes.length > 0) {
							for (var mode_i=0; mode_i<selectable_modes.length; mode_i++) {
								this_mode = selectable_modes[mode_i];
								if (user_has_section_permission(unit, req.user.username, val, this_mode)) {
									user_modes_by_section[val].push(this_mode);
								}
							}
						}
						else {
							console.log("[ route / ] ERROR: 0-length required array unit.selectable_modes in unit " + unit + " (this should never happen)");
						}
					}
					else {
						console.log("[ route / ] ERROR: Missing required setting unit.selectable_modes in unit " + unit + " (this should never happen)");
					}
				}
			}
		}
	}
	if (fun.is_not_blank(req.query.section)) {
		section = req.query.section;
	}
	else if (user_sections && (user_sections.length>=1)) {
		section = user_sections[0];
	}
	if (fun.is_not_blank(req.query.category)) {
		category = req.query.category;
		//TODO: make fine-grained permission for this
	}
	if (fun.is_not_blank(req.query.table)) {
		dataset_name = req.query.table;
		//TODO: make fine-grained permission for this
	}
	else if (fun.is_not_blank(req.query.dataset_name)) {
		dataset_name = req.query.dataset_name;
		//TODO: make fine-grained permission for this
	}
	if (unit!==null) {
		if (!fsc.hasOwnProperty(unit)) {
			console.log("[ - ] ERROR in route '/': selected unit " + unit + " does not exist");
		}
		else {
			if (section) {
				if (!fsc[unit].hasOwnProperty(section)) {
					console.log("[ - ] ERROR in route '/': selected section " + section + " does not exist in unit " + unit);
				}
				else {
					if (!fsc[unit][section].hasOwnProperty(category)) {
						console.log("[ - ] ERROR in route '/': selected category "+category+" does not exist in unit "+unit+" section " + section);
					}
					else {
						if (!fsc[unit][section][category].hasOwnProperty(dataset_name)) {
							console.log("[ - ] ERROR in route '/': selected table "+dataset_name+" does not exist in unit "+unit+" section " + section + " category " + category);
						}
					}
				}
			}
		}

		if (section) {
			if (dataset_name===null) {
				if (has_setting(unit, section+".primary_dataset_name")) {
					dataset_name=peek_setting(unit, section+".primary_dataset_name");
				}
			}
			if (category===null) {
				if (has_setting(unit, section+".primary_category")) {
					category=peek_setting(unit, section+".primary_category");
				}
			}
			if (has_setting(unit, section+".sheet_fields")) {
				var section_sheet_fields = peek_setting(unit, section+".sheet_fields");
				for (var indexer in section_sheet_fields) {
					var ssf = section_sheet_fields[indexer];
					this_sheet_field_names.push(ssf);
					if (has_setting(unit, section+".sheet_display_names."+ssf)) ssf = peek_setting(unit, section+".sheet_display_names."+ssf);
					this_sheet_field_friendly_names.push(ssf);
				}
			}
			if (fsc.hasOwnProperty(unit) && fsc[unit].hasOwnProperty(section)) {
				if (category===null) {
					var cat_count = 0;
					var last_cat = null;
					for (var this_cat in fsc[unit]) {
						if (fsc[unit].hasOwnProperty(this_cat)) {
							cat_count++;
							last_cat = this_cat;
							if (cat_count > 1) break;
						}
					}
					if (cat_count==1) category=last_cat;
				}
				if (dataset_name===null) {
					if (category!==null && fsc[unit].hasOwnProperty(category)) {

						var table_count = 0;
						var last_table = null;
						for (var this_table in fsc[unit][category]) {
							if (fsc[unit][category].hasOwnProperty(this_table)) {
								table_count++;
								last_table = this_table;
								if (table_count > 1) break;
							}
						}
						if (table_count==1) dataset_name=last_table;
					}
				}
			}
		}
	}

	if (fun.is_not_blank(req.query.mode)) {
		mode = req.query.mode;
	}
	else if (user_modes_by_section.hasOwnProperty(section) && user_modes_by_section[section] && user_modes_by_section[section].length>=1) {
		if (req.user && req.user.username && (default_mode_by_user.hasOwnProperty(req.user.username))) mode=default_mode_by_user[req.user.username];
		else mode = user_modes_by_section[section][user_modes_by_section[section].length-1];
		req.session.mode = mode;
	}

	var prefill_mode = ""; //differs from prefill.mode in that prefill_mode specifies what mode the form should post as
	if (fun.is_not_blank(req.query.prefill_mode)) {
		prefill_mode = req.query.prefill_mode;
		req.session.prefill_mode = prefill_mode;
	}
	else if ((req.session.prefill.hasOwnProperty("prefill_mode")) && fun.is_not_blank(req.session.prefill.prefill_mode)) {
		prefill_mode = req.session.prefill_mode;
	}
	//if (fun.is_not_blank(req.body.prefill_mode)) {
	//	prefill_mode = req.body.prefill_mode;
	//	req.session.prefill_mode = prefill_mode;
	//}

	if (req.query.hasOwnProperty("selected_year")) {
		selected_year = req.query.selected_year;
		if (selected_year=="(none)") selected_year = null;
		req.session.selected_year = selected_year;
		//console.log("[   ] got selected_year "+selected_year+" from query");
	}
	//else if (req.session.selected_year) {
	//	selected_year = req.session.selected_year;
		//console.log("[   ] got selected_year "+selected_year+" from session");
	//}
	if (req.query.hasOwnProperty("selected_number")) {
		selected_number = req.query.selected_number;
	}
	if (req.query.hasOwnProperty("selected_month")) {
		selected_month = req.query.selected_month;
		if (selected_month=="(none)") selected_month = null;
		req.session.selected_month = selected_month;
	}
	//else if (req.session.selected_month) {
	//	selected_month = req.session.selected_month;
	//}
	//console.log("req.query.selected_month:"+req.query.selected_month);
	//console.log("req.session.selected_month:"+req.session.selected_month);
	//console.log("selected_month:"+selected_month);
	if (req.query.selected_day) {
		selected_day = req.query.selected_day;
		if (selected_day=="(none)") selected_day = null;
		req.session.selected_day = selected_day;
	}
	//else if (req.session.selected_day) {
	//	selected_day = req.session.selected_day;
	//}
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
			if (user_has_section_permission(unit, req.user.username, section, "read") || user_has_section_permission(unit, req.user.username, section, "reports")) {
				var y_dir_name = moment().format("YYYY");
				var m_dir_name = moment().format("MM");
				var d_dir_name = moment().format("DD");
				var year_month_string = moment().format("YYYY-MM");
				var date_string = moment().format("YYYY-MM-DD");
				var auto_select_month_enable = true;  // should usually be true even for reports, since only month view shows entry problems; formerly (mode=="reports") ? false : true;
				if (fun.is_not_blank(mode)) {
					if (has_setting(unit, section+"."+mode+".auto_select_month_enable")) auto_select_month_enable = peek_setting(unit, section+"."+mode+".auto_select_month_enable");
				}
				if (fsc != null && unit != null && fsc.hasOwnProperty(unit) && section != null && fsc[unit].hasOwnProperty(section) &&
						category != null && fsc[unit][section].hasOwnProperty(category)) {  // NOTE: regenerate_cache (called after listen) probably already finished making sure that fsc is setup
					// TODO: years is only the proper thing to check if category=="transactions"
					var unit_path=storage_path+"/units/"+unit;
					var cat_path=unit_path+"/"+category;
					if (dataset_name!=null && fsc[unit][section][category].hasOwnProperty(dataset_name)) {
						years = Object.keys(fsc[unit][section][category][dataset_name]);
					}
					if (req.query.selected_year!=="(none)") {  // else do not autoselect if (none) was explicit
						if (years.length==1) {
							selected_year = years[0];
							if (!selected_year) console.log("ERROR: blanked out on year (cache fail)");
							else console.log("[   ] "+moment().format("HH:mm:ss")+" verbose message: autoselected the only existing year "+selected_year);
						}
						else if (fun.is_blank(selected_year) && years.length>0) {
							console.log("[   ] no selected_year "+selected_year);
							selected_year = years[years.length-1];
							if (!selected_year) console.log("ERROR: blanked out on year (cache fail)");
							else console.log("[   ] "+moment().format("HH:mm:ss")+" verbose message: autoselected the latest year "+selected_year);
						}
					}
					if (!years) {
						console.log("WARNING: no years (no data or cache fail)");
					}

					if (selected_year) {
						var dataset_path=cat_path+"/"+dataset_name;
						var y_path = dataset_path + "/" + selected_year;
						//if (fun.is_not_blank(unit)&&fun.is_not_blank(section)&&fun.is_not_blank(category)&&fun.is_not_blank(dataset_name)) {
						if (fsc[unit].hasOwnProperty(section)) {
							if (fsc[unit][section].hasOwnProperty(category)) {
								if (fsc[unit][section][category].hasOwnProperty(dataset_name)) {
									if (fsc[unit][section][category][dataset_name].hasOwnProperty(selected_year)) {
											// ok since if selected_year, there must be years in this table
										if (fsc[unit][section][category][dataset_name][selected_year]===null) {
											//TODO: load this year into cache
											console.log("[   ] missing cache for " + unit + "/" + section + "/" + category + "/" + selected_year + " (null year cache subobject)");
										}
										else {
											months = Object.keys(fsc[unit][section][category][dataset_name][selected_year]);
											//console.log("(got cached months: "+fun.to_ecmascript_value(months));
										}
										if (auto_select_month_enable && (req.query.selected_month!=="(none)")) { //else do not autoselect if (none) was explicit
											if (months.length==1) {
												selected_month = months[0];
												console.log("[   ] Auto selected_month "+selected_month);
												if (!selected_month) console.log("ERROR: blanked out on month[0] (cache fail)");
											}
											else if (!selected_month && months.length>0) {
												selected_month = months[months.length-1];
												console.log("[   ] Auto selected_month "+selected_month);
												if (!selected_month) console.log("ERROR: blanked out on month[length-1] (cache fail)");
											}
										}
										else console.log("[   ] month "+selected_month+" was not autoselected (selected_year: "+selected_year+").");

										var m_path = y_path + "/" + selected_month;
										if (fun.is_not_blank(selected_month) && !fsc[unit][section][category][dataset_name][selected_year].hasOwnProperty(selected_month)) {
											//stale selection
											console.log("* cleared stale month selection "+selected_month+" from other section or year (that isn't in "+selected_year+" in "+section+")");
											selected_month = null;
										}
										if (selected_month) {
											if (fsc[unit][section][category][dataset_name][selected_year].hasOwnProperty(selected_month)) {
												days = Object.keys(fsc[unit][section][category][dataset_name][selected_year][selected_month]);
											}
											else selected_day = null;
											if (req.query.selected_day!=="(none)") { //else do not autoselect if (none) was explicit
												if (days.length==1) {
													selected_day = days[0];
												}
												else if (!selected_day && days.length>0) {
													selected_day = days[days.length-1];
												}
											}
											if (selected_day) {
												var d_path = m_path + "/" + selected_day;
												if (fsc[unit][section][category][dataset_name][selected_year][selected_month].hasOwnProperty(selected_day)) {
													item_keys = Object.keys(fsc[unit][section][category][dataset_name][selected_year][selected_month][selected_day]);
													items = fsc[unit][section][category][dataset_name][selected_year][selected_month][selected_day];
												}
												else {
													//stale selection
													console.log("* cleared stale day selection ("+selected_day+") not in year "+selected_year+" month "+selected_month+" in /"+unit+"/"+section+"/"+category+"/transactions/"+dataset_name);
													selected_day = null;
												}
											}//end if selected_day
										}//end if selected_month
									}
									else {
										req.session.error = "Selected invalid year " + selected_year;
									}
								}
								else {
									req.session.error = "no dataset_name "+category+" in "+storage_path+"/"+unit+"/"+section+"/"+category;
								}
							}
							else {
								req.session.error = "no category "+category+" in "+storage_path+"/"+unit+"/"+section;
							}
						}
						else {
							//req.session.error = "Invalid table "+unit+"/"+section+"/"+category+"/"+dataset_name;
							req.session.error = "no section "+section+" in unit "+unit;
						}
					}
					//else {
						//console.log("could not select a year (probably there are no years in this table yet)");
					//}
				}
				else {
					if (unit !== null && section !== null && category !== null && dataset_name !== null) {
						req.session.error = "Failed to find cached directory for unit:" +  unit + " section:" + section + " category:" + category + " dataset_name:" + dataset_name;
					}
					else {
						var fails_msg = "";
						if (unit===null) fails_msg += " unit"
						if (section===null) fails_msg += " section"
						if (category===null) fails_msg += " category"
						if (dataset_name===null) fails_msg += " dataset_name"
						req.session.error = "Failed to choose: " + fails_msg;
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
	var user_selectable_modes = null;
	if (section && user_modes_by_section && user_modes_by_section.hasOwnProperty(section)) user_selectable_modes = user_modes_by_section[section];
	res.render('home', {user: req.user, unit: unit, section: section, category: category, dataset_name: dataset_name, runme: req.session.runme, mode: mode, selected_setting: req.query.selected_setting, prefill: req.session.prefill, missing_fields: req.session.missing_fields, prefill_mode: prefill_mode, selected_year:selected_year, selected_month: selected_month, selected_day: selected_day, selected_number: selected_number, section_report_edit_field: req.session.section_report_edit_field, selected_item_key: selected_item_key, sections: user_sections, user_selectable_modes: user_selectable_modes, years: years, months: months, days: days, objects: items, this_sheet_field_names: this_sheet_field_names, this_sheet_field_friendly_names: this_sheet_field_friendly_names});
	delete req.session.runme;
});

//displays our signup page
app.get('/login', function(req, res){
	load_permissions("showing login", req);
	load_groups("showing login", req);

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

var autofill_query_callback = function (err) {
	if (err) {
		return console.log("[ * ] finished saving entry by autofill..."+err);
	}
	//else console.log("[ * ] saving entry"+reason+"...OK");
};

app.post('/autofill-query', function(req, res){
	//aka autofilla all, aka autofill-all, aka autofill_all
	var sounds_path_then_slash = "sounds/";
	var update_match_count = 0;
	var update_saved_count = 0;
	var unit = null;
	if (req.hasOwnProperty("user") && req.user.hasOwnProperty("username")) {
		if (req.body.unit) {
			unit = req.body.unit;
			var section = req.body.section;
			if (section && req.body.selected_year && req.body.selected_month) {// && req.body.selected_field) {
				if (user_has_section_permission(unit, req.user.username, section, "modify")) {
					// get_dataset_info(unit, section, category, dataset_name)
					var category = null;
					var dataset_name = null;
					if (req.body.category) category=req.body.category;
					if (req.body.dataset_name) dataset_name=req.body.dataset_name;
					var table_info = get_dataset_info(unit, section, category, dataset_name, false);
					var dataset_path = null;
					if (table_info.enable) {
						dataset_path = table_info.dataset_path;
					}
					else {
						var msg = "ERROR in autofill-query: "+table_info.error;
						console.log(msg);
						req.session.error=msg;
					}
					if (dataset_path !== null) { //asdf dataset_path is undefined
						var y_path = dataset_path + "/" + req.body.selected_year;
						var m_path = y_path + "/" + req.body.selected_month;
						//if (fs.existsSync(m_path)) {
						//if (autofill_requires.hasOwnProperty(section) && autofill_requires[section].hasOwnProperty(req.body.selected_field)) {
						if (has_setting(unit, section+".autofill_requires")) {
							//var msg = 'Changed value for '+req.body.selected_field+' to '+req.body.set_value;
							var msg = 'Filled ';
							var ok = false;
							if (fsc[unit][section][category][dataset_name].hasOwnProperty(req.body.selected_year)) {
								if (fsc[unit][section][category][dataset_name][req.body.selected_year].hasOwnProperty(req.body.selected_month)) {
									var days_len=fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month].length;
									if (days_len>0) {
										for (var day_key in fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month]) {
										//for (var day_i=0; day_i<days_len; day_i++) {
											//var day_key = day_keys[day_i];
											var d_path = m_path + "/" + day_key;
											if (fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month].hasOwnProperty(day_key)) {
												var items_len=fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][day_key].length;
												if (items_len>0) {
													for (var item_key in fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][day_key]) {
														if (fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][day_key].hasOwnProperty(item_key)) {
															var item_path = d_path + "/" + item_key;
															var item = fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][day_key][item_key];
															var results = autofill(unit, section, item, true);
															if (results.filled_fields.length>0) {
																//item["mtime"] = moment().format('YYYY-MM-DD HH:mm:ss Z');
																//item["modified_by"] = req.user.username;
																try {
																	item.autofilled_by = req.user.username;
																	item.autofilled_time = moment().format('YYYY-MM-DD HH:mm:ss Z');
																	if (item.hasOwnProperty("autofilled_fields")) {
																		for (var k=0; k<results.filled_fields.length; k++) {
																			if (!fun.array_contains(results.filled_fields[k])) {
																				item.autofilled_fields.push(results.filled_fields[k]);
																			}
																		}
																	}
																	else item.autofilled_fields = results.filled_fields;
																	var reason = " in autofill-query";
																	yaml.write(item_path, item, 'utf8', autofill_query_callback);  // yaml.writeSync(item_path, item, "utf8");
																	update_saved_count++;
																}
																catch (err) {
																	req.session.error = "\nCould not finish writing "+item_path+": "+err;
																}
															}
															update_match_count++;
															ok=true; //verified cache is ok either way
														}
														else {
															msg="Failed to modify since can't find file cache for "+item_path;
															console.log(msg);
															req.session.error=msg;
														}
													}
												}
												else console.log("[ _ ] Cache missed -- 0 item_keys for "+day_key);

											}
											else console.log("[ _ ] Cache missed for day "+day_key);
										}//end of outermost for loop
										req.session.success = msg + " " + update_saved_count + " of " + update_match_count + " record(s).";
									}
									else console.log("[ _ ] Cached missed -- 0 days in month "+req.body.selected_month);
								}
								else console.log("[ _ ] Cache missed for month "+req.body.selected_month);
							}
							else console.log("[ _ ] Cache missed for year "+req.body.selected_year);
							if (!ok) req.session.error = "Cache failure in update query so skipped saving value for "+req.body.selected_field+"!";
						}
						else {
							req.session.error = "Section "+section+" does not specify which information is needed to uniquely identify person (_settings["+section+"]['autofill_requires'] does not have a field list for "+req.body.selected_field+")";
						}
					}
					else {
						//no data yet// req.session.error = "";
						req.session.info = table_info.error;
					}
				}
				else {
					req.session.error = "not authorized to modify data for '" + section + "'";
					if (config.audio_enable) req.session.runme = ("var audio = new Audio('"+sounds_path_then_slash+"security-warning.wav'); audio.play();"); //new Handlebars.SafeString
					delete req.session.prefill.pin;
				}
			}
			else {
				req.session.error = "section, selected_year, and selected_month are required but form is not complete";
				if (config.audio_enable) req.session.runme = ("var audio = new Audio('"+sounds_path_then_slash+"security-warning.wav'); audio.play();"); //new Handlebars.SafeString
				delete req.session.prefill.pin;
			}
		}
		else {
			req.session.error = "form is missing unit";
		}
	}

	res.redirect(config.proxy_prefix_then_slash);
}); //end autofill-query


app.post('/update-query', function(req, res){
	var category="transactions";
	var dataset_name = "student";
	var sounds_path_then_slash = "sounds/";
	var update_match_count = 0;
	var update_saved_count = 0;
	if (req.hasOwnProperty("user") && req.user.hasOwnProperty("username")) {
		var unit = req.body.unit;
		var section = req.body.section;
		var category = req.body.category;
		var dataset_name = req.body.dataset_name;
		if (section && req.body.selected_field) {
			if (user_has_section_permission(unit, req.user.username, section, "modify")) {
				var dataset_path = get_dataset_path_if_exists_else_null(unit, section, category, dataset_name, false);
				if (dataset_path !== null) {
					var y_path = dataset_path + "/" + req.body.selected_year;
					var m_path = y_path + "/" + req.body.selected_month;
					//if (fs.existsSync(m_path)) {
					//if (autofill_requires.hasOwnProperty(section) && autofill_requires[section].hasOwnProperty(req.body.selected_field)) {
					if (has_setting(unit, section+".autofill_requires."+req.body.selected_field)) {
						var msg = 'Changed value for '+req.body.selected_field+' to '+req.body.set_value;
						var ok = false;
						var table_info = get_dataset_info(unit, section, category, dataset_name);
						///TODO: eliminate years, months, days
						if (table_info.enable) {
							if (fsc[unit][section][category][dataset_name].hasOwnProperty(req.body.selected_year)) {
								if (fsc[unit][section][category][dataset_name][req.body.selected_year].hasOwnProperty(req.body.selected_month)) {
									var days_len=fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month].length;
									if (days_len>0) {
										for (var day_key in fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month]) {
											if (fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month].hasOwnProperty(day_key)) {
												var d_path = m_path + "/" + day_key;
												var items_len=fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][day_key].length;
												if (items_len>0) {
													for (var item_key in fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][day_key]) {
														var item_path = d_path + "/" + item_key;
														if (fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][day_key].hasOwnProperty(item_key)) {
															if (fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][day_key].hasOwnProperty(item_key)) {
																var item = fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][day_key][item_key];
																match_count=0;
																//TODO: use autofill method instead of for loop:
																for (var i=0; i<_settings[section].autofill_requires[req.body.selected_field].length; i++) {
																	var key = _settings[section].autofill_requires[req.body.selected_field][i];
																	var val = "";
																	if (item.hasOwnProperty(key)) {
																		var where_key = "where_"+key;
																		if ( req.body[where_key] && fun.is_not_blank(req.body[where_key]) &&
																			(req.body[where_key] == item[key]) ) {
																			match_count++;
																			//console.log("req.body[where_key]:"+req.body[where_key]+" is item[key]:"+item[key]);
																		}
																		//else console.log("req.body[where_key]:"+req.body[where_key]+" is not item[key]:"+item[key]);
																	}
																	//ret += "\n "+key+':<input type="text" name="where_'+key+'" id="'+key+'" value="'+val+'"/><br/>';
																}
																if (match_count>0 && match_count==_settings[section].autofill_requires[req.body.selected_field].length) {
																	fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][day_key][item_key][req.body.selected_field] = req.body.set_value;
																	fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][day_key][item_key].mtime = moment().format('YYYY-MM-DD HH:mm:ss Z');
																	fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][day_key][item_key].modified_by = req.user.username;
																	try {
																		//yaml.writeSync(item_path, fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][day_key][item_key], "utf8");
																		var reason = " in update-query";
																		yaml.write(item_path, fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][day_key][item_key], 'utf8', function (err) {
																			if (err) {
																				//return console.log("[ * ] saving entry"+reason+"..."+err);
																				return console.log("[ * ] saving entry...FAIL: "+err);
																			}
																			else console.log("[ * ] saving entry...OK");
																			//else console.log("[ * ] saving entry"+reason+"...OK");
																		});
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
															match_count = 0; //out of scope
														}
														else {
															msg="Failed to modify since can't find cache for file "+item_path;
															console.log(msg);
															req.session.error=msg;
														}
													}
												}
												else console.log("[ ] Cache missed -- 0 item_keys for "+day_key);

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
							console.log("[ ] Cache missed for section "+section+": "+table_info.error);
						}
						if (!ok) req.session.error = "Cache failure in update query so skipped saving value for "+req.body.selected_field+"!";
					}
					else {
						req.session.error = "Section "+section+" does not specify which information is needed to uniquely identify person (_settings["+section+"]['autofill_requires'] does not have a field list for "+req.body.selected_field+")";
					}
				}
				else {
					req.session.error = "Section "+section+" does not have any data)";
					delete req.session.prefill.pin;
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

	res.redirect(config.proxy_prefix_then_slash);
}); //end update-query

app.post('/change-microevent-field', function(req, res){
	var category="transactions";
	var dataset_name = "student";
	var sounds_path_then_slash = "sounds/";
	var bookmark_enable = false;
	if (req.method!= 'PUT' && req.method!='POST') {
		console.log("ERROR: bad method " + req.method + " in /change-microevent-field");
	}
	if (req.hasOwnProperty("user") && req.user.hasOwnProperty("username")) {
		var unit = req.body.unit;
		var section = req.body.section;
		if (user_has_section_permission(req.body.unit, req.user.username, section, "modify")) {
			var dataset_path = get_dataset_path_if_exists_else_null(req.body.unit, section, category, dataset_name, true);
			if (dataset_path !== null) {
				var y_path = dataset_path + "/" + req.body.selected_year;
				var m_path = y_path + "/" + req.body.selected_month;
				var d_path = m_path + "/" + req.body.selected_day;
				//NOTE: only modify req.body.selected_field
				var item_path = d_path + "/" + req.body.selected_key;
				if (fun.is_not_blank(req.body.selected_key) && fs.existsSync(item_path)) {
					bookmark_enable = true;
					var msg = 'Changed value for '+req.body.selected_field+' to '+req.body.set_value;
					var ok = false;
					var table_info = get_dataset_info(req.body.unit, section, category, dataset_name);
					///TODO: eliminate years, months, days
					if (table_info.enable) {
						if (fsc[unit][section][category][dataset_name].hasOwnProperty(req.body.selected_year)) {
							if (fsc[unit][section][category][dataset_name][req.body.selected_year].hasOwnProperty(req.body.selected_month)) {
								if (fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month].hasOwnProperty(req.body.selected_day)) {
									if (fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][req.body.selected_day].hasOwnProperty(req.body.selected_key)) {

										fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][req.body.selected_day][req.body.selected_key][req.body.selected_field] = req.body.set_value;
										fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][req.body.selected_day][req.body.selected_key].mtime = moment().format('YYYY-MM-DD HH:mm:ss Z');

										autofill(unit, section, fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][req.body.selected_day][req.body.selected_key], false);
										try {

											if ("duplicate_key" in req.body) {
												fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][req.body.selected_day][req.body.selected_key].duplicate_of_key = req.body.duplicate_key;
											}
											if ("duplicate_time" in req.body) {
												fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][req.body.selected_day][req.body.selected_key].duplicate_of_time = req.body.duplicate_time;
											}
											if ("duplicate_date" in req.body) {
												fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][req.body.selected_day][req.body.selected_key].duplicate_of_date = req.body.duplicate_date;
											}
											if ("status_changed_by" in req.body) {
												fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][req.body.selected_day][req.body.selected_key].status_changed_by = req.body.status_changed_by;
												fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][req.body.selected_day][req.body.selected_key].status_changed_time = moment().format('YYYY-MM-DD HH:mm:ss Z');
											}
											else {
												fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][req.body.selected_day][req.body.selected_key].modified_by = req.user.username;
											}
											//yaml.writeSync(item_path, fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][req.body.selected_day][req.body.selected_key], "utf8");
											var reason = " in change-microevent-field";
											yaml.write(item_path, fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][req.body.selected_day][req.body.selected_key], 'utf8', function (err) {
												if (err) {
													//return console.log("[ * ] saving entry"+reason+"..."+err);
													return console.log("[ * ] saving entry...FAIL: "+err);
												}
												else console.log("[ * ] saving entry...OK");
												//else console.log("[ * ] saving entry"+reason+"...OK");
											});
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
						console.log("Cache missed for section "+section+": "+table_info.error);
					}
					if (!ok) req.session.error = "Cache failure in change-microevent-field so skipped saving value for "+req.body.selected_field+"!";
				}
				else {
					var msg = 'Skipping change to field since '+item_path+' does not exist.';
					console.log(msg);
					//if (!req.body.selected_year) {
						console.log("(debug only in /change-microevent-field) req.body: " + JSON.stringify(req.body));
					//}
					req.session.error = msg;
				}
			}
			else req.session.error = 'Skipping change to field since there is no category folder in transaction folder for '+section+'.';
		}
		else {
			req.session.error = "not authorized to modify data for '" + section + "'";
			if (config.audio_enable) req.session.runme = ("var audio = new Audio('"+sounds_path_then_slash+"security-warning.wav'); audio.play();"); //new Handlebars.SafeString
			delete req.session.prefill.pin;
		}
	}

	var a_suffix = "";
	if (fun.is_not_blank(req.body.scroll_to_named_a)) a_suffix = "#"+req.body.scroll_to_named_a;
	else if (fun.is_not_blank(req.body.selected_key)) a_suffix = "#"+req.body.selected_key;
	res.redirect(config.proxy_prefix_then_slash+((bookmark_enable)?(a_suffix):""));
});  // change-microevent-field

app.post('/add-end-dates-to-bill', function(req, res){
	var category = "tables";
	var dataset_name = "BillingCycle";
	var sounds_path_then_slash = "sounds/";
	var bookmark_enable = false;
	var indent="  ";
	var msg;
	var unit = req.body.unit;
	if (req.hasOwnProperty("user") && req.user.hasOwnProperty("username")) {
		var section = req.body.section;
		if (user_has_section_permission(unit, req.user.username, section, "billing")) {
			var category="tables";
			var dataset_name="BillingCycle";
			var count_added = 0;
			var matching_vars_count = 0;
			var dates = [];
			console.log("New Cycle Display Name (user-entry): "+req.body.new_cycle_name);
			for (var key in req.body) {
				if (key.startsWith("form_bill_for_")) {
					//if (req.body[key]=="on") {
					//NOTE: all values should be "on", and any that were unchecked should not have been sent.
					var date_8_digit = key.substring(key.length-8);
					console.log("  [ $ ] "+date_8_digit+": "+req.body[key]);
					dates.push(date_8_digit.substring(0,4)+"-"+date_8_digit.substring(4,6)+"-"+date_8_digit.substring(6));
					count_added++;
					//}
				}
				matching_vars_count++;
			}
			if (matching_vars_count===0) {
				msg = "No values were sent from form.";
				console.log(msg);
				req.session.error = msg;
			}
			else if (count_added===0) {
				msg = "0 were checked.";
				console.log(msg);
				req.session.error = msg;
			}
			else {
				//msg = "WARNING: This feature is not yet implemented.";
				//console.log(msg);
				//req.session.notice = msg;
				//results = push_next_transaction(unit, section, dataset_name, ymd_array, record, as_username, autofill_enable)
				//results = push_next_table_entry(unit, section, dataset_name, record, as_username, autofill_enable)

				//FORM VARS: selected_year section mode new_cycle_name [and dates which were made into an array above]
				var record = {};
				//NOTE: this is just a billing cycle so don't add invoice_date here
				//--via another route, add invoice_date to invoice after invoice is created based on this billing cycle
				//record.invoice_date = moment().format('YYYY-MM-DD');
				record.end_dates = dates;
				record.cycle_name = req.body.new_cycle_name;  // ok if blank
				//NOTE: time, ctime, and tz_offset_mins are set by push (actually by _write_record_as_is indirectly)
				var results = push_next_table_entry(unit, section, dataset_name, record, req.user.username, false);
				if (results.hasOwnProperty('error')) req.session.error = results.error;
			}
		}
		else {
			console.log(msg);
			req.session.error = "not authorized to modify data for '" + section + "'";
			if (config.audio_enable) req.session.runme = ("var audio = new Audio('"+sounds_path_then_slash+"security-warning.wav'); audio.play();"); //new Handlebars.SafeString
			delete req.session.prefill.pin;
		}
	}

	res.redirect(config.proxy_prefix_then_slash+"?section="+req.body.section+"&mode="+req.body.mode+"&selected_year="+req.body.selected_year+"&selected_month=(none)" + ((bookmark_enable)?("#"+req.body.selected_key):"") );
});

split_entry_callback = function (err) {
	//NOTE: new_record_paths[x] is not defined in this scope
	if (err) console.log(indent + "  * ERROR while deleting a stay split result: " + err);
	else console.log(indent + "  * deleted a stray split result");
};

app.post('/split-entry', function(req, res){
	var sounds_path_then_slash = "sounds/";
	var bookmark_enable = false;
	var indent="  ";
	var unit = req.body.unit;
	if (req.hasOwnProperty("user") && req.user.hasOwnProperty("username")) {
		var section = req.body.section;
		if (user_has_section_permission(unit, req.user.username, section, "modify")) {
			var category="transactions";
			var dataset_name = "student";
			var dataset_path = get_dataset_path_if_exists_else_null(unit, section, category, dataset_name, false);
			if (dataset_path !== null) {
				var y_path = dataset_path + "/" + req.body.selected_year;
				var m_path = y_path + "/" + req.body.selected_month;
				var d_path = m_path + "/" + req.body.selected_day;
				//NOTE: only modify req.body.selected_field
				var item_path = d_path + "/" + req.body.selected_key;
				if (fun.is_not_blank(req.body.selected_key) && fs.existsSync(item_path)) {
					if (fun.is_not_blank(req.body.scroll_to_named_a)) bookmark_enable = true;
					var msg = 'Changed value for '+req.body.selected_field+' to '+req.body.set_value;
					var ok = false;
					var table_info = get_dataset_info(unit, section, category, dataset_name);
					///TODO: eliminate years, months, days
					if (table_info.enable) {
						if (fsc[unit][section][category][dataset_name].hasOwnProperty(req.body.selected_year)) {
							if (fsc[unit][section][category][dataset_name][req.body.selected_year].hasOwnProperty(req.body.selected_month)) {
								if (fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month].hasOwnProperty(req.body.selected_day)) {
									if (fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][req.body.selected_day].hasOwnProperty(req.body.selected_key)) {
										var hdv_item_splitter_name = null;
										if (has_setting(unit, section+".list_implies_multiple_entries")) hdv_item_splitter_name = peek_setting(unit, section+".list_implies_multiple_entries");
										if (hdv_item_splitter_name!==null) {
											var original_item = fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][req.body.selected_day][req.body.selected_key];
											var subvalues = fun.get_human_delimited_values(original_item[hdv_item_splitter_name]);

											var hdv_paired_name = null;
											if (has_setting(unit, section+".list_implies_multiple_entries_paired_with")) hdv_paired_name = peek_setting(unit, section+".list_implies_multiple_entries_paired_with");
											var matching_pairs = null;
											if (hdv_paired_name!==null) {
												matching_pairs = fun.get_human_delimited_values(original_item[hdv_paired_name]);
											}

											var hdv_or_single_name = null;
											if (has_setting(unit, section+".list_implies_multiple_entries_paired_with_unless_has_one")) hdv_or_single_name = peek_setting(unit, section+".list_implies_multiple_entries_paired_with_unless_has_one");
											var matching_pairs_else_single_value = null;
											if (hdv_or_single_name!==null) {
												matching_pairs_else_single_value = fun.get_human_delimited_values(original_item[hdv_or_single_name]);
											}

											console.log("");
											console.log("[ | ] Splitting...");

											console.log(indent+"subvalues: "+JSON.stringify(subvalues));
											if ( (hdv_paired_name===null || (matching_pairs!==null&&matching_pairs.length===subvalues.length)) &&
												(hdv_or_single_name===null || (matching_pairs_else_single_value!==null&&(matching_pairs_else_single_value.length===subvalues.length||matching_pairs_else_single_value.length==1)))
											) {
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
													var optionally_paired_index_else_0 = 0;
													//for (var i=0,len=subvalues.length; i<len; i++) {
													for (var i=0,len=subvalues.length; i<len; i++) {
														var new_item = JSON.parse(JSON.stringify(original_item));
														console.log(indent + " subvalue " + i + " of " + len + ": " + subvalues[i] + "...");
														new_item.split_source_field = req.body.selected_field;
														new_item.split_time = split_time;
														new_item.split_by = req.user.username;
														delete new_item.qty;
														new_item.split_source = "dated_folder_record " + section + "/" + req.body.selected_year + "/" + req.body.selected_month + "/" + req.body.selected_day + "/" + req.body.selected_key;
														new_item[req.body.selected_field] = subvalues[i];
														if (matching_pairs) {
															new_item[hdv_paired_name] = matching_pairs[i];
															console.log(indent+"  set paired field "+hdv_paired_name+" to "+matching_pairs[i]);
														}
														if (matching_pairs_else_single_value) {
															new_item[hdv_or_single_name] = matching_pairs_else_single_value[optionally_paired_index_else_0];
															if (matching_pairs_else_single_value.length===1)
																console.log(indent+"  set optionally paired field "+hdv_paired_name+" to non-paired value: "+matching_pairs_else_single_value[optionally_paired_index_else_0]);
															else
																console.log(indent+"  set optionally paired field "+hdv_paired_name+" to paired value: "+matching_pairs_else_single_value[optionally_paired_index_else_0]);
														}
														//autofill(unit, section, new_item, false);
														var new_key = original_item.key;
														if (original_item.key) {
															var key_split = fun.splitext(original_item.key);
															new_key = key_split[0] + "-" + (i+1) + ((key_split[1]!=="")?("."+key_split[1]):"");
														}
														else new_key=null;  // results in a key being generated based on the current time
														//fields were already validated since using an existing entry
														//fields were already autofilled above
														//                             req_else_null, section, date_array_else_null, record, deepest_dir, as_username,     write_mode, custom_file_name_else_null, autofill_enable
														var write_new_results = _write_record_as_is(req, unit, section, category, date_array,    null,       new_item, req.user.username, "create", new_key,                    false);
														if (write_new_results.out_path && write_new_results.out_name) { //write_new_results.out_path is only set AFTER file is written so always check that
															new_item.key = write_new_results.out_name;
															fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][req.body.selected_day][write_new_results.out_name] = new_item;
															if (!fun.array_contains(fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][req.body.selected_day].item_keys,write_new_results.out_name))
																fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][req.body.selected_day].item_keys.push(write_new_results.out_name);
														}
														if (write_new_results.notice) notice += "\n"+write_new_results.notice+" "; //+"<!--" + out_path + "-->.";
														if (write_new_results.out_path) {
															new_record_paths.push(write_new_results.out_path);
															new_record_ids.push("dated_folder_record " + section + "/" + req.body.selected_year + "/" + req.body.selected_month + "/" + req.body.selected_day + "/" + write_new_results.out_name);
														}
														if (fun.is_not_blank(write_new_results.error)) error += "\n"+write_new_results.error+" ";
														ok=true; //verified cache is ok either way
														tried_output_count += 1;
														console.log(indent+"  done splitting value at index "+i);
														if (matching_pairs_else_single_value.length!==1) optionally_paired_index_else_0++;
													}//end for subvalues
													var tmp;
													if (subvalues.length<1) {
														tmp = "ERROR: can't split subvalues from hdv_item_splitter_name: "+original_item[hdv_item_splitter_name];
														error += tmp;
														console.log(indent+tmp);
													}
													else if (tried_output_count<req.body.expected_count) {
														tmp = "ERROR: did't split "+req.body.expected_count+" expected subvalues--only tried "+tried_output_count+" of "+subvalues.length+" split";
														error += tmp;
														console.log(indent+tmp);
													}

													if (fun.is_blank(error)) {
														original_item.split_destination_field = req.body.selected_field;

														original_item.split_time = split_time;
														//original_item["modified_by"] = req.user.username;
														original_item.split_by = req.user.username;
														original_item.split_destinations = new_record_ids;
														original_item.active = false; //no longer use the record, it has been split
														original_item[req.body.selected_field] = original_field_value;
														console.log(indent + "saving old record as deactivated: " + req.body.selected_key);
														var results = _write_record_as_is(req, unit, section, category, date_array, null, original_item, req.user.username, "modify", req.body.selected_key, false);
														//fsc[unit][section][category][dataset_name][req.body.selected_year][req.body.selected_month][req.body.selected_day][req.body.selected_key] = original_item;
														if (fun.is_blank(results.error)) {
															if (config.audio_enable) req.session.runme = ("var audio = new Audio('"+sounds_path_then_slash+"success.wav'); audio.play();"); //new Handlebars.SafeString
														}
														else {
															error += "\n"+results.error+" ";
														}
														if (fun.is_not_blank(results.notice)) notice += "\n" + results.notice + " ";
													}
													else {
														console.log(indent + "rolling back changes...");
														for (x=0; x<new_record_paths.length; x++) {
															console.log(indent + "* Deleting " + new_record_paths[x] + "...");
															fs.unlink(new_record_paths[x], split_entry_callback);
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
						console.log("Cache missed for section "+section+": "+table_info.error);
					}
					//if (!ok) req.session.error = "Cache failure in split-entry so skipped saving value for "+req.body.selected_field+"!";
				}
				else {
					req.session.error = 'Skipping split-entry since '+item_path+' does not exist.';
				}
			}
			else req.session.error = 'Skipping split-entry since there is no category folder in transaction folder for '+section+'.';
		}
		else {
			req.session.error = "not authorized to modify data for '" + section + "'";
			if (config.audio_enable) req.session.runme = ("var audio = new Audio('"+sounds_path_then_slash+"security-warning.wav'); audio.play();"); //new Handlebars.SafeString
			delete req.session.prefill.pin;
		}
	}
	res.redirect(config.proxy_prefix_then_slash+((bookmark_enable)?("#"+req.body.scroll_to_named_a):""));
});

// Admin can save status, which is normally only in memory (at some point it should be saved in intervals and onlu if changed)
app.get('/save-status', function(req, res){
	// NOTE: req.body does not inherit from object therefore doesn't have
	// hasOwnProperty
	var unit = req.query.unit;
	var sounds_path_then_slash = "sounds/";
	if (_groups.hasOwnProperty("admin") && fun.array_contains(_groups.admin, req.user.username)) {
		var u_info = fun.param_info(req.query, "unit", fsc);
		var unit = u_info.value;
		var section = null;
		if (u_info.hasOwnProperty("error")) req.session.error = u_info.error + "during /save-status";
		else {
			var s_info = fun.param_info(req.query, "section", fsc[unit]);
			section = s_info.value;
			if (s_info.hasOwnProperty("error")) req.session.error = s_info.error + "during /save-status";
		}
		if ((unit!==null) && (section!==null)) {
			if ((fsc[unit][section].hasOwnProperty("status"))) {
				var tracked_count = 0;
				if (has_setting(unit, section+".status_keys")) {
					var status_keys = peek_setting(unit, section+".status_keys");
					//"<!--show_status: listing "+status_keys.length+" status_key(s) for "+section+"-->";
					if (!fs.existsSync(storage_path)) fs.mkdirSync(storage_path);
					var units_path = storage_path + "/units";
					if (!fs.existsSync(units_path)) fs.mkdirSync(units_path);
					var unit_path = units_path + "/" + unit;
					if (!fs.existsSync(unit_path)) fs.mkdirSync(unit_path);
					var section_path = unit_path + "/" + section;
					if (!fs.existsSync(section_path)) fs.mkdirSync(section_path);
					var category = "status";
					var category_path = section_path + "/" + category;
					if (!fs.existsSync(category_path)) fs.mkdirSync(category_path);

					for (var k_i=0; k_i<status_keys.length; k_i++) {
						var primary_key = status_keys[k_i];
						//item.tmp = {};
						//if (item.hasOwnProperty(primary_key)) {
						//item.tmp.key = item[primary_key];
						var dataset_name = primary_key;
						var dataset_path = category_path + "/" + dataset_name; //dataset_name folder, such as "MAC" folder inside "status" folder
						if (!fs.existsSync(dataset_path)) fs.mkdirSync(dataset_path);

						for (var id in fsc[unit][section][category][dataset_name]) {
							if (fsc[unit][section][category][dataset_name].hasOwnProperty(id)) {
								//tracked_count++;
								var id_path = dataset_path + "/" + id;  // such as status/MAC/FFFFFFFFFFFF folder containing status.yml and possibly other info
								if (!fs.existsSync(id_path)) fs.mkdirSync(id_path);  // make it a folder so it can contain multipart data
								var file_name = "status.yml";
								var yml_path = id_path + "/" + file_name;
								//TODO: Compare and keep old metadata (mark 'active: false' on old member object(s) only?)
								//TODO: * also save changes to audit trail
								if (fsc[unit][section][category][dataset_name][id].hasOwnProperty(file_name)) {
									yaml.write(yml_path, fsc[unit][section][category][dataset_name][id][file_name], "utf8", function (err) {
										if (err) {
											console.log("[ status ] Error during /save-status: " + err);
										}
										//else console.log("[ . ] saved settings");
									});
								}
								else {
									console.log("[ status ] Error during /save-status: " + file_name + " doesn't exist in cache for " +
											    unit + "." + section + "." + category + "." + dataset_name + "." + id);
								}
							}
						}
						//}
					}
				}
				else req.session.error = ("/save-status: no status_keys for "+section);
			}
			else req.session.error = ("/save-status: no status in section "+section);
		}
		//else error already shown
	}
	else {
		req.session.error = "You are not in the admin group";
		if (config.audio_enable) req.session.runme = ("var audio = new Audio('"+sounds_path_then_slash+"security-warning.wav'); audio.play();"); //new Handlebars.SafeString
		delete req.session.prefill.pin;
	}
	res.redirect(config.proxy_prefix_then_slash);
});

app.get('/reload-settings', function(req, res){
	var sounds_path_then_slash = "sounds/";
	if (_groups.hasOwnProperty("admin") && fun.array_contains(_groups.admin, req.user.username)) {
		ptcache = {};
		var pt_msg = "; and emptied plain text file cache";
		//if (req.query.asdf=="reload-settings") {
		if (fs.existsSync(settings_path)) {
			_settings = yaml.readSync(settings_path, "utf8");
			var time_msg = moment().format("HH:mm:ss");
			req.session.success = "Successfully reloaded "+settings_path+pt_msg+" at "+time_msg+".";
			console.log("[ ^. ] reloaded settings");
		}
		else {
			_settings = JSON.parse(JSON.stringify(settings_default));
			console.log("[ ^. ] reloaded settings from defaults"+pt_msg+".");
			//yaml.writeSync(settings_path, _settings, "utf8");
			yaml.write(settings_path, _settings, "utf8", function (err) {
				if (err) {
					console.log("[ . ] Error while saving settings in /reload-settings: " + err);
				}
				//else console.log("[ . ] saved settings");
			});
			req.session.notice = "WARNING: "+settings_path+" could not be read in /reload-settings, so loaded then saved defaults there instead"+pt_msg+".";
			//console.log("* saved settings");
		}
		//}
		//else req.session.error = "Unknown admin request "+req.query.mode;
	}
	else {
		req.session.error = "ERROR in reload-settings: You are not in the admin group";
		if (config.audio_enable) req.session.runme = ("var audio = new Audio('"+sounds_path_then_slash+"security-warning.wav'); audio.play();"); //new Handlebars.SafeString
		delete req.session.prefill.pin;
	}
	res.redirect(config.proxy_prefix_then_slash);
	//res.write("<html><body>admin did it</body></html>")
});

app.get('/reload-permissions-and-groups', function(req, res){
	var sounds_path_then_slash = "sounds/";
	if ((_groups===null) || (_groups.hasOwnProperty("admin") && fun.array_contains(_groups.admin, req.user.username))) {
		load_groups("reload-permissions-and-groups", req);
		load_permissions("reload-permissions-and-groups", req);
		if (_groups===null) console.log("NOTICE: allowed reload-permissions-and-groups without credentials (not a security risk) since wasn't loaded yet.");
	}
	else {
		req.session.error = "ERROR in reload-permissions-and-groups: You are not in the admin group";
		if (config.audio_enable) req.session.runme = ("var audio = new Audio('"+sounds_path_then_slash+"security-warning.wav'); audio.play();"); //new Handlebars.SafeString
		delete req.session.prefill.pin;
	}
	res.redirect(config.proxy_prefix_then_slash);
	//res.write("<html><body>admin did it</body></html>")
});

app.post('/poke-settings', function(req, res) {
	var sounds_path_then_slash = "sounds/";
	var unit = req.body.unit;
	if (req.hasOwnProperty("user") && req.user.hasOwnProperty("username")) {
		if (user_has_section_permission(unit, req.user.username, "admin", "poke-settings")) {
			req.session.success = "poking value "+req.body.selected_setting+"="+peek_setting(unit, req.body.selected_setting)+" to "+req.body.selected_setting_value;
			poke_setting(unit, req.body.selected_setting, req.body.selected_setting_value);
		}
		else {
			req.session.error = "not authorized to modify data for '" + req.body.section + "'";
			if (config.audio_enable) req.session.runme = ("var audio = new Audio('"+sounds_path_then_slash+"security-warning.wav'); audio.play();"); //new Handlebars.SafeString
			delete req.session.prefill.pin;
		}
	}

	res.redirect(config.proxy_prefix_then_slash);
});

function do_track(params) {
	// NOTE: before passing post (req.body as opposed to get's req.query), convert to object, since:
	// req.body does not inherit from object therefore doesn't have hasOwnProperty
	var results = {};
	var unit = null;
	var section = null;
	var category = "status";
	//NOTE: dataset_name is set to primary key(s) below
	if (typeof params.hasOwnProperty !== 'function') {
		results.error = "ERROR in do_track: params must be converted to object";
		console.log(results.error);
	}
	else {
		var u_info = fun.param_info(params, "unit", fsc);
		unit = u_info.value;

		if (u_info.hasOwnProperty("error")) results.error = u_info.error + "during do_track";
		else {
			var s_info = fun.param_info(params, "section", fsc[unit]);
			section = s_info.value;
			if (s_info.hasOwnProperty("error")) results.error = s_info.error + "during do_track";
		}
	}
	if ((unit!==null) && (section!==null)) {
	//if (req.hasOwnProperty("user") && req.user.hasOwnProperty("username")) {
		//if (user_has_section_permission(unit, req.user.username, "admin", "poke-settings")) {

		if ("mode" in params) {
			var mode = params.mode;
			if (mode == "create") {
				// always create since always anonymous
			}
			else {
				results.error = "only create is implemented."; //continue anyway though
			}
			if (has_setting(unit, section+".status_keys")) {
				var status_keys = peek_setting(unit, section+".status_keys");

				if (unit in fsc) {
					var unit_path = storage_path+"/units/"+unit;
					if (section in fsc[unit]) {
						var section_path=unit_path+"/"+section;
						if (!(category in fsc[unit][section])) {
							fsc[unit][section][category] = {};
							fs.mkdirSync(storage_path);
						}
						var tracked_count = 0;
						for (var k_i=0; k_i<status_keys.length; k_i++) {
							var primary_key = status_keys[k_i];
							var dataset_name = primary_key;
							if (primary_key in params) {
								var id = params[primary_key];
								//item.tmp = {};
								var item = null; //start as null for each key, in case their are multiple tables (each with different primary key)
								var modify_enable = false;
								if ( (primary_key in fsc[unit][section][category]) &&
									 (id in fsc[unit][section][category][primary_key])
								) {
									item = fsc[unit][section][category][primary_key][id];
									modify_enable = true;
								}
								if (item === null) item = {};

								//TODO: if modify_enable (if record existed), mark whatever changed and store old value in audit entry
								for (var field_name in params) {
									item[field_name] = params[field_name];
								}

								if (item.hasOwnProperty(primary_key)) {
									//item.tmp.key = item[primary_key];
									item.key_name = primary_key;
									var local_time_zone = null;
									//this isn't guaranteed (user must set for individual server bios time if using linux): if (has_setting(unit, "unit.local_time_zone")) local_time_zone = peek_setting(unit, "unit.local_time_zone");
									//if (Date.format("HH:mm:ss") > Date.parse("15:05:00"))
									if (local_time_zone !== null) item.tz = local_time_zone;
									if (!("tz_offset_mins" in item)) item.tz_offset_mins = moment().utcOffset();
									if (!("ctime" in item)) item.ctime = moment().format('YYYY-MM-DD HH:mm:ss Z');
									else item.mtime = moment().format('YYYY-MM-DD HH:mm:ss Z');
									var local_now = moment();

									if (!(primary_key in fsc[unit][section][category])) fsc[unit][section][category][primary_key] = {}; //such as "MAC" folder inside "status" folder
									if (!(id in fsc[unit][section][category][primary_key]))
										fsc[unit][section][category][primary_key][id] = item;
									//else is already up to date since item is a reference to it

									results.success = "tracking: "+JSON.stringify(item);
									tracked_count++;
								}
							}
						}
						if (tracked_count<1) {
							results.error = "nothing tracked since no key exists for any of the status_keys: "+JSON.stringify(status_keys);
						}
					}
					else {
						results.error = "invalid section "+section;
					}
				}
				else {
					results.error = "invalid unit "+unit;
				}
			}
			else {
				results.error = "missing setting "+section+".status_keys";
			}
		}
		else {
			results.error = "missing mode param";
		}
	}
	//}
	return results;
}//end do_track

app.get('/tr', function(req, res) { //aka "/t" (tr is track, get version) see also show_status helper
	var results = do_track(req.query);
	res.type('text/plain');  // res.setHeader("content-type", "text/plain");
	var msg = "";
	if ("error" in results) msg = "error: "+results.error;
	if ("success" in results) msg += "\n" + results.success;
	else msg = "success: ok";
	//console.log("[ track ] "+msg);
	msg += "\n";
	//msg += "settings:"+"\n"; //NOTE: iedup will resave settings each time if any are present (if below, if indented under "settings:")
	//force iedup to use POST:
	//msg += "  ping_host: " + req.get('host') + "/tp" + "\n"; //NOTE: this gets localhost
	//msg += "  form_method: POST" + "\n";
	res.send(msg);//res.write(msg);
});

//get list of file keys for files that should be on a given machine group
app.get('/cpflr', function(req, res) {  // computer policy file list request
	res.type('text/plain');  // res.setHeader("content-type", "text/plain");
	var section = "tm";
	var this_endl = "\n";
	var kernel = null;
	var unit = req.body.unit;
	//TODO: (?) set unit to default unit if none specified
	if (req.query.hasOwnProperty("kernel")) kernel = req.query.kernel.toLowerCase();
	else {
		kernel = "linux";
		script_msg += "; no kernel was in request";
	}
	if (kernel == "windows") {
		this_endl = "\r\n";
	}
	var good_flag = "update_enable: true";
	var msg = "# policy file list by file_key" + this_endl;
	if (req.query.hasOwnProperty("unit")) {
		var unit = req.query.unit;
		var machine_group = null;
		if (req.query.hasOwnProperty("machine_group")) {
			machine_group = req.query.machine_group;
			var cp_trail = section+".files."+machine_group+"."+kernel;
			if (has_setting(unit, cp_trail)) {
				var cp = peek_setting(unit, cp_trail);  // computer policy
				for (var key in cp) {
					if ("dest_path" in cp[key]) {
						// client doesn't need to know the internal server source_path,
						// but it has to exist for the server to serve it:
						if ("source_name" in cp[key]) {
							msg += key + ":" + this_endl;
							msg += "  dest_path: " + cp[key].dest_path;
							if (cp[key].hasOwnProperty("permissions_octal")) {
								msg += "  permissions_octal: " + cp[key].permissions_octal;
							}
						}
						else {
							msg += "# missing source_path in " + cp_trail+"."+key;
						}
					}
					else {
						msg += "# missing dest_path in " + cp_trail+"."+key;
					}
				}
			}
			else {
				msg += '# there is no matching cp setting for ' + cp_trail + this_endl;
			}
		}
	}
	else {
		msg += '# failed to obtain cps since no unit was specified by request' + this_endl;
	}
	res.send(msg);
});

function get_cpf_plain_text(params_dict, remarks_list) {
	var msg = "";
	var section = "tm";
	var unit = null;

	if (params_dict.hasOwnProperty("unit")) {
		// TODO: validate request so they can only get unit
		// --such as use computer name and MAC combination for machine authentication, where MAC is obtained via
		// MAC=`cat /sys/class/net/enp0s25/address`
		// where enp0s25 is any interface in /sys/class/net other than lo (usually is enp0s25 for: Fedora 27, Ubuntu Xenial, and Antergos ~ 2018 Jan)
		// there is also MAC=`ip addr | grep link/ether | awk '{print $2}'`  (tested on Antergos)
		// IP Address: based on the above, you can a list of all of them (starting with 127.0.0.1 like:)
		// IP=`ip addr | grep "inet " | awk '{print $2}'`
		// * leave out the empty space after inet to include ipv6 ("inet6" addresses)
		//   but IP=`hostname -i` works to get primary one (but will not be one in list above if ethernet configuration is corrupt)
		unit = params_dict.unit;
	}
	else if (!(typeof params_dict.hasOwnProperty === 'function')) {
		//maybe body (not derived from object so no hasOwnProperty)
		unit = params_dict.unit;
	}

	var file_key = null;
	var script_msg = "";
	var attributes = [];
	var perms_octal = null;
	if (params_dict.hasOwnProperty("file_key")) {
		// NOTE: # NOTE: # NOTE: file_key is redefined by unit.yml, in that file_key is just the key to the object in the `"tm.files."+machine_group+"."+kernel` dictionary is redefined by unit.yml, in that file_key is just the key to the object in the `"tm.files."+machine_group+"."+kernel` dictionary is redefined by unit.yml, in that file_key is just the key to the object in the `"tm.files."+machine_group+"."+kernel` dictionary
		file_key = params_dict.file_key;
	}
	else {
		if (params_dict.hasOwnProperty("script_name")) {
			file_key = params_dict.script_name;
			script_msg += "; script_name is deprecated--use file_key instead";
		}
		else {
			// file_key = "daily";
			file_key = "heal_student_updater";
			script_msg += "; no file_key was in request";
		}
	}
	var kernel = null;
	if (params_dict.hasOwnProperty("kernel")) kernel = params_dict.kernel.toLowerCase();
	else {
		kernel = "linux";
		script_msg += "; no kernel was in request";
	}
	var script_remark = "# ";
	var this_endl = "\n";
	var this_attrib = "chmod +";
	var this_perms = "chmod ";
	var good_flag = "update_enable: true";
	if (kernel == "windows") {
		script_remark = "REM ";
		this_endl = "\r\n";
		this_attrib = "attrib +";
		this_perms = null;
	}
	var machine_group_s = null;
	if (params_dict.hasOwnProperty("machine_group")) {
		machine_group_s = params_dict.machine_group;
	}
	else {
		machine_group_s = "StudentMachines";
		//TODO: lookup by MAC if present
	}
	var stated_username = null;
	if (params_dict.hasOwnProperty("stated_username")) {
		stated_username = params_dict.stated_username;
		//TODO: record in tr directory
	}
	var local_username = null;
	if (params_dict.hasOwnProperty("local_username")) {
		local_username = params_dict.local_username;  // NOTE: unused
	}
	if (fun.is_not_blank(unit)) {
		if (fun.is_not_blank(file_key)) {
			// msg += this_endl + script_remark + file_key + ' cps for ' + kernel + ' for unit ' + params_dict.unit + " should appear below" + script_msg;
			var script_trail = section + ".files." + machine_group_s + "." + kernel + "." + file_key + "." + "source_name";
			var script_dest_trail = section + ".files." + machine_group_s + "." + kernel + "." + file_key + "." + "dest_path";
			var script_attribs_trail = section + ".files." + machine_group_s + "." + kernel + "." + file_key + "." + "attributes";
			var script_octal_trail = section + ".files." + machine_group_s + "." + kernel + "." + file_key + "." + "permissions_octal";
			if (has_setting(unit, script_trail)) {
				if (has_setting(unit, script_dest_trail)) {
					if (has_setting(unit, script_attribs_trail)) {
						attributes = peek_setting(unit, script_attribs_trail);
					}
					if (has_setting(unit, script_octal_trail)) {
						perms_octal = peek_setting(unit, script_octal_trail);
					}
					var dest_path = peek_setting(unit, script_dest_trail);
					var source_name = peek_setting(unit, script_trail);  // source_name never needs to be known by the user, it is the name of the file
					var script_path = storage_path + "/units/" + unit + "/" + section + "/files/(system)/" + source_name;
					// console.log("loading " + script_path);
					var lines = null;
					if (ptcache.hasOwnProperty(script_path)) {
						lines = ptcache[script_path];
					}
					else {
						// data = fs.readFileSync(script_path);
						lines = [];
						fs.readFileSync(script_path).toString().split("\n").forEach(function(line, index, arr) {
						  if (index === arr.length - 1 && line === "") { return; }
						  lines.push(line);
						});
						ptcache[script_path] = lines;
					}
					for (var l_i=0; l_i<lines.length; l_i++) {
						if (l_i==1) {
							msg += this_endl + script_remark + "file_key: " + file_key;
							msg += this_endl + script_remark + "dest_path: " + dest_path;
							if (remarks_list !== null) {
								for (var r_i=0; r_i<remarks_list.length; r_i++) {
									msg += this_endl + script_remark + remarks_list[r_i];
								}
							}
							if (attributes!==null) {
								for (var atr_i=0; atr_i<attributes.length; atr_i++) {
									msg += this_endl + script_remark + "post_install: " + this_attrib + attributes[atr_i] + ' "' + dest_path + '"';
								}
							}
							if (perms_octal!==null) {
								var var_name = "post_install";
								if (this_perms===null) var_name="mismatched_os_setting";
								msg += this_endl + script_remark + var_name + ": " + this_attrib + perms_octal + ' "' + dest_path + '"';
							}
						}
						msg += this_endl + lines[l_i];
					}
					msg += this_endl + script_remark + good_flag;
					if (file_key == "minetest_conf") {
						if (fun.is_not_blank(stated_username)) {
							msg += this_endl + "name = " + stated_username;
						}
					}
				}
				else {
					msg += this_endl + 'echo "server has no mps setting ' + script_dest_trail + '"';
				}
			}
			else {
				msg += this_endl + 'echo "there is no mps setting ' + script_trail + '"';
			}
		}
		else {
			msg += this_endl + '# "failed to obtain mps since no file_key was specified by request"';
		}
	}
	else {
		msg += this_endl + '# "failed to obtain mps since no unit was specified by request"';
	}
	return msg;
}

app.get('/cppr', function(req, res) {  // computer policy plaintext request; gets a plaintext file by name
	// linux machine should get the hourly cron job script like:
	// wget --output-document=iedu-cs-hourly /cp?unit=0&kernel=linux&access_level=root&machine_group=StudentMachines&pf_name=hourly
	// then the file will be named iedu-cs-hourly
	res.type('text/plain');//res.setHeader("content-type", "text/plain");
	// remarks = [];
	var msg = get_cpf_plain_text(req.query, null);
	res.send(msg);
});

app.get('/cpsr', function(req, res) {  // computer policy text file request
	// linux machine should get the hourly cron job script like:
	// wget --output-document=iedu-cs-hourly /cp?unit=0&kernel=linux&access_level=root&machine_group=StudentMachines&pf_name=hourly
	// then the file will be named iedu-cs-hourly
	res.type('text/plain');//res.setHeader("content-type", "text/plain");
	remarks = [];
	remarks.push("cpsr (script request) is deprecated. Use cppr (plain text request) instead");
	var msg = get_cpf_plain_text(req.query, remarks);
	res.send(msg);
});

app.post('/tp', function(req, res) { //aka "/t" (tp is track, post version) see also show_status helper
	var params = req.body;
	if ((typeof params.hasOwnProperty) !== 'function') {
		params = fun.to_object(req.body);
	}
	var results = do_track(fun.to_object(params));
	var msg = "success: ok";
	res.type('text/plain');//res.setHeader("content-type", "text/plain");
	if ("success" in results) msg += "\n" + results.success;
	else msg = "success: ok";
	if ("error" in results) msg = "error: " + results.error;
	//console.log("[ track ] "+msg);
	msg += "\n";
	//msg += "settings:"+"\n"; //NOTE: iedup will resave settings each time if any are present (if below, if indented under "settings:")
	//force iedup to use POST:
	//msg += "  ping_host: " + req.get('host') + "/tp" + "\n"; //NOTE: this gets localhost for some reason (perhaps only certain network situations?)
	//msg += "  form_method: POST" + "\n";
	res.send(msg);//res.write(msg);
}); //end "/tp"

app.get('/change-selection', function (req, res) {
	var sounds_path_then_slash = "sounds/";
	var section = req.query.section;
	var unit = req.query.unit;
	if (req.hasOwnProperty("user") && req.user.hasOwnProperty("username")) {
		if (user_has_section_permission(req.query.unit, req.user.username, section, "read")) {
			//if (req.query.selected_field) {
			//	req.session.selected_field = req.query.selected_field;
			//	console.log("Changed req.session.selected_field to "+req.session.selected_field);
			//}
			var val;
			if (req.query.change_section_report_edit_field) {
				var selected_field = null;
				if (peek_setting(req.query.unit, section+".sheet_display_names")) {
					var sheet_display_names = peek_setting(unit, section+".sheet_display_names");
					for (var key in sheet_display_names) {
						if (has_setting(unit, section+".sheet_display_names."+key)) {
							val = peek_setting(unit, section+".sheet_display_names."+key);
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
				if (selected_field===null && has_setting(unit, section+".sheet_fields")) {
					var section_sheet_fields = peek_setting(unit, section+".sheet_fields");
					for (var i=0; i<section_sheet_fields.length; i++) {
						val = section_sheet_fields[i];
						if (val.toLowerCase()==req.query.change_section_report_edit_field) {
							selected_field = val;
						}
					}
				}
				if (selected_field!==null) {
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

	res.redirect(config.proxy_prefix_then_slash);
});

app.post('/change-section-settings', function(req, res) {
	var sounds_path_then_slash = "sounds/";
	var tmp;
	var unit = req.body.unit;
	if (req.hasOwnProperty("user") && req.user.hasOwnProperty("username")) {
		if (user_has_section_permission(unit, req.user.username, req.body.section, "change-section-settings")) {
			if (has_setting(unit, req.body.section+"."+req.body.selected_setting)) {
				if (req.body.selected_setting=="local_start_time") {
					tmp = fun.good_time_string(req.body.selected_setting_value);
					if (tmp) {
						poke_setting(unit, req.body.section+"."+req.body.selected_setting, tmp);
					}
					else req.session.error = "Invalid time format";
				}
				else if (req.body.selected_setting=="local_end_time") {
					tmp = fun.good_time_string(req.body.selected_setting_value);
					if (tmp) {
						poke_setting(unit, req.body.section+"."+req.body.selected_setting, tmp);
					}
					else req.session.error = "Invalid time format";
				}
				else {
					poke_setting(unit, req.body.section+"."+req.body.selected_setting, req.body.selected_setting_value);
					req.session.success = "Changed "+req.body.section+" "+req.body.selected_setting+" to "+peek_setting(unit, req.body.section+"."+req.body.selected_setting);
				}
			}
			else {
				req.session.error = "no setting "+req.body.selected_setting+" exists in "+req.body.section+" section";
			}
		}
		else {
			req.session.error = "not authorized to modify data for '" + req.body.section + "'";
			if (config.audio_enable) req.session.runme = ("var audio = new Audio('"+sounds_path_then_slash+"security-warning.wav'); audio.play();"); //new Handlebars.SafeString
			delete req.session.prefill.pin;
		}
	}
	res.redirect(config.proxy_prefix_then_slash);
});

app.post('/student-microevent', function(req, res){
	//req is request, res is response
	var sounds_path_then_slash = "sounds/";
	var category = "transactions";
	var dataset_name = "student";
	//sounds_path_then_slash = config.proxy_prefix_then_slash+"sounds/";
	//sounds_path_then_slash = sounds_path_then_slash.substring(1); //remove leading slash
	var unit = req.body.unit;
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
		var section_form_fields = null;
		if (has_setting(unit, section+".form_fields")) {
			section_form_fields = peek_setting(unit, section+".form_fields");
			for (var index in section_form_fields) {
				if (section_form_fields.hasOwnProperty(index)) {
					var key = section_form_fields[index];
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
		if (has_setting(unit, section+".required_fields")) {
			var section_required_fields = peek_setting(unit, section+".required_fields");
			for (var srf_i in section_required_fields) {
				if (section_required_fields.hasOwnProperty(srf_i)) {
					var srf = section_required_fields[srf_i];
					if (req.session.prefill.hasOwnProperty(srf)) {
						if (fun.is_blank(req.session.prefill[srf])) delete req.session.prefill[srf];
					}
					if (!req.session.prefill.hasOwnProperty(srf)) {
						custom_error = "MISSING: ";
						if (missing_msg !== "") missing_msg += ",";
						key_friendly_name = srf;
						if (srf in fields_friendly_names) key_friendly_name = fields_friendly_names[srf];
						missing_msg += " " + srf;
						req.session.missing_fields.push(srf);
					}
					//else {
					//    console.log("_ prefill."+srf + " is in session with value "+req.session.prefill[srf]);
					//}
				}
			}
		}
		else {
			console.log("WARNING: no required fields are specified for section '" + section + "'.");
			custom_error = "no required fields are specified for section '" + section + "'";
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
					if ( req.session.prefill.stated_date.substring(2,3)=="/" &&
					     req.session.prefill.stated_date.substring(5,6)=="/" &&
					     fun.only_contains_any_char(req.session.prefill.stated_date.substring(0,2), "0123456789") &&
					     fun.only_contains_any_char(req.session.prefill.stated_date.substring(3,5), "0123456789") &&
					     fun.only_contains_any_char(req.session.prefill.stated_date.substring(6), "0123456789")
						) {
						//convert MM/DD/YYYY to YYYY-MM-DD:
						original_stated_date = req.session.prefill.stated_date;
						req.session.prefill.stated_date = req.session.prefill.stated_date.substring(6) + "-" + req.session.prefill.stated_date.substring(0,2) + "-" + req.session.prefill.stated_date.substring(3,5);
						stated_date_enable = true;
						console.log("  * NOTE: converted date " + original_stated_date + " to " + req.session.prefill.stated_date);
					}
					else if ( req.session.prefill.stated_date.substring(4,5)=="-" &&
					          req.session.prefill.stated_date.substring(7,8)=="-" &&
					          fun.only_contains_any_char(req.session.prefill.stated_date.substring(0,4), "0123456789") &&
					          fun.only_contains_any_char(req.session.prefill.stated_date.substring(5,7), "0123456789") &&
					          fun.only_contains_any_char(req.session.prefill.stated_date.substring(8), "0123456789")
						) {
						stated_date_enable = true;
						console.log("  * NOTE: got good stated_date " + req.session.prefill.stated_date);
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
					if (user_has_pinless_time(unit, section, req.user.username)) {
						console.log("  * NOTE: PIN skipped for commute custom date: "+req.user.username+" (this is ok since user has pinless custom time for this section)");
					}
					else if (user_has_section_permission(unit, req.user.username, section, "modify")) {
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
				if ( req.session.prefill.stated_time.toLowerCase().match("am") ||
					 req.session.prefill.stated_time.toLowerCase().match("pm") ) {
					if (  (section=="commute") &&  ( (!req.body.pin) || (req.body.pin!=config.office_pin))  ) {
						if (user_has_section_permission(unit, req.user.username, "commute", "modify")) {
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
				if (user_has_section_permission(unit, req.user.username, section, "create")) {
					var ymd_array;
					if (stated_date_enable) ymd_array = record.stated_date.split("-");  //ok since already validated or conformed
					else ymd_array = moment().format("YYYY-MM-DD").split("-");
					            //_write_record_as_is(req_else_null, unit, section, category, date_array_else_null, deepest_dir_else_null, record, as_username,  write_mode,  custom_file_name_else_null, autofill_enable) {
					var results = _write_record_as_is(req,           unit, section, category, ymd_array,            null,                  record, req.user.username, "create", null,                      true); //already validated above
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
		else { //custom error
			for (var field_name in req.body) {
				if (section_form_fields !== null) {
						// may be null since this is custom_error case
					if (fun.array_contains(section_form_fields, field_name)) {
						req.session.prefill[field_name] = req.body[field_name];
					}
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
	res.redirect(config.proxy_prefix_then_slash);
});

//sends the request through our local login/signin strategy, and if successful takes user to homepage, otherwise returns then to signin page
//app.post('/login', passport.authenticate('local-login', {
//	successRedirect: config.proxy_prefix_then_slash,
//	failureRedirect: config.proxy_prefix_then_slash + 'login'
//	})
//);
//above also works, but has no way to do custom output
//see <http://www.passportjs.org/docs/> under Custom Callback:
app.post('/login', function(req, res, next) {
	//req.body for post, req.query for get
  passport.authenticate('local', function(err, user, info) {
	// err,user,info: from `new LocalStrategy`'s callback, which calls this function as the verified function--see `verified(`)
	// (NOT  function as the resolve/reject function--see `resolve` and `reject` in exports.localAuth )
	req.session.setup_banner = null;
	req.session.missing_users = null;
	//console.log("(/login) err: ", err)
	//console.log("(/login) user: ", user)
	//console.log("(/login) info: ", info)
    if (err) {
		//then there is only 1 param and it was an Error object
		if (err.body.includes('atabase connection')) {
			console.log("(/login) (err) missing database");
			console.log("");
			var admin_msg = "";
			if (req.body.username == 'admin') {
				console.log("ERROR connecting to database");
				console.log("  Make sure mongod service is running (see README.md)");
				console.log("");
				console.log("");
				admin_msg = " (error information has been written to server console)"
			}
			req.session.setup_banner = 'Database connection failed' + admin_msg + '.';
		}
		else {
			console.log("(/login) (err) info: ", info);
		}
		console.log("")
		console.log("")
		//return next(err);  //just shows user error on white background
		return res.redirect(config.proxy_prefix_then_slash + 'login');
	}
	if (!user) {
		// info.message is ALWAYS "Missing credentials" if user or
		// password was blank (it does NOT call verify, so custom error
		// (as received by next `else if` case) cannot be set--
		// see passport-local/lib/strategy.js)
		req.session.error = "Please enter a username and password";
		return res.redirect(config.proxy_prefix_then_slash + 'login');
	}
    else if (user.hasOwnProperty('error')) {
		// 'error' is ALWAYS defined by my LocalStrategy's callback when
		// err is null and login fails for non-database reason
		if (req.body.username == 'admin') {
			if (user.error.includes("username")) {
				//admin wasn't created, so get some more info for admin:
				req.session.setup_banner = 'Your server is not setup yet. You must first click "I need to make an account" and make a user named "admin".';
				req.session.missing_users = [];
				//req.session.missing_users.push('admin');
				all_users = get_all_permitted_users();

				//for (var this_username in all_users) {
				for (var user_i=0; user_i<all_users.length; user_i++) {
					var this_username = all_users[user_i];
					//if (all_users.hasOwnProperty(this_username)) {
					fun.userExists(this_username)
					.then(function(result) {
						if (!result.found) {
							console.log("WARNING: need to create user which already has permissions: ", result.username);
							//TODO: the following fails since it is set later than the page loads (create a json route to check this list, and remove it from the messaging middleware so it isn't erased):
							if (req.session.missing_users.indexOf(result.username) < 0) {
								req.session.missing_users.push(result.username);
							}
						}
					})
					.fail(function(result) {
						console.log("ERROR: userExists failed");
					});
					//}
				}
				console.log("all users with permissions: " + JSON.stringify(all_users));
			}
			else {
				console.log("(/login) user.error: (admin) " + user.error);
			}
		}
		else console.log("(/login) user.error: " + user.error);
		return res.redirect(config.proxy_prefix_then_slash + 'login');
	}
    req.logIn(user, function(err) {
		if (err) {
			console.log("(/login) (logIn err): ", err)
			console.log("")
			console.log("")
			return next(err);
		}
		console.log("(/login) (logIn)")
		console.log("")
		console.log("")
		return res.redirect(config.proxy_prefix_then_slash);
    });
  })(req, res, next);
});

//logs user out of site, deleting them from the session, and returns to homepage
app.get('/logout', function(req, res){
	if (req.user) {
		var name = req.user.username;
		console.log("LOGGING OUT " + req.user.username);
	}
	else {
		console.log("* LOGGING OUT but no user is loaded (that's ok--server was probably reset since last page refresh, then user clicked logout)");
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
console.log("[ listening ] ...");
// server ready to accept connections here
load_permissions("service starting", null);
load_groups("service starting", null);
regenerate_cache();
