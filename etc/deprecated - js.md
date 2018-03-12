# Deprecated code

* Deprecated (from end of write_record_without_validation--replaced by code that instead updates fsc):
```javascript
//write cache
//NOTE: dat will not exist yet if no user with read priv has loaded a page (even if a user with create/modify loaded a page)
/*
if (dat) {
	if (!dat.hasOwnProperty(section)) {
		console.log(indent+"ERROR: section "+section+" is not in cache");
		dat[section]={};
	}
	if (fun.is_not_blank(y_dir_name)) {
		if (!dat[section].hasOwnProperty(y_dir_name))
			dat[section][y_dir_name]={};
		if (!dat[section].hasOwnProperty("years"))
			dat[section].years = [];
		if (!fun.array_contains(dat[section].years, y_dir_name))
			dat[section].years.push(y_dir_name);


		if (!dat[section][y_dir_name].hasOwnProperty(m_dir_name))
			dat[section][y_dir_name][m_dir_name]={};
		if (!dat[section][y_dir_name].hasOwnProperty("months"))
			dat[section][y_dir_name].months = [];
		if (!fun.array_contains(dat[section][y_dir_name].months, m_dir_name))
			dat[section][y_dir_name].months.push(m_dir_name);

		if (!dat[section][y_dir_name][m_dir_name].hasOwnProperty(d_dir_name))
			dat[section][y_dir_name][m_dir_name][d_dir_name] = {};
		if (!dat[section][y_dir_name][m_dir_name].hasOwnProperty("days"))
			dat[section][y_dir_name][m_dir_name].days = [];
		if (!fun.array_contains(dat[section][y_dir_name][m_dir_name].days, d_dir_name))
			dat[section][y_dir_name][m_dir_name].days.push(d_dir_name);

		dat[section][y_dir_name][m_dir_name][d_dir_name][results.out_name] = record;
		if (!dat[section][y_dir_name][m_dir_name][d_dir_name].hasOwnProperty("item_keys"))
			dat[section][y_dir_name][m_dir_name][d_dir_name].item_keys = [];
		if (!fun.array_contains(dat[section][y_dir_name][m_dir_name][d_dir_name].item_keys, results.out_name))
			dat[section][y_dir_name][m_dir_name][d_dir_name].item_keys.push(results.out_name);
		//console.log(indent+"CACHE was updated for section "+section+" by adding entry "+results.out_name+" to date "+y_dir_name+"-"+m_dir_name+"-"+d_dir_name);
	}
	//else //is not a transaction table so has no dates.
		//TODO: cache it a different way
}
//else doesn't matter since cache will be loaded from drive and then be fresh
*/
```

* Deprecated (switched to fully preloaded fsc)--from `if (selected_day)` case in '/' route:
```javascript
var msg = "";
for (var item_key_i in item_keys) {
	var item_key = item_keys[item_key_i];
	var item_path = d_path + "/" + item_key;
	//console.log("  - "+item_key);
	dat[section][selected_year][selected_month][selected_day][item_key] = {};
	if (fs.statSync(item_path).isFile()) {
		if (item_path.endsWith(".yml")) {
			try {
				var errors = "";
				dat[section][selected_year][selected_month][selected_day][item_key] = yaml.readSync(item_path, "utf8");

				dat[section][selected_year][selected_month][selected_day][item_key].key = item_key;
				//dat[section][selected_year][selected_month][selected_day][this_item] = yaml.readSync(item_path, "utf8");
				var this_item = dat[section][selected_year][selected_month][selected_day][item_key];
				this_item.tmp = {};
				this_item.tmp.time = fun.get_time_or_stated_time(this_item);
				if (this_item.tmp.time===null) {
					var name_as_time = fun.splitext(item_key)[0];
					if (name_as_time.length>=6) {
						this_item.tmp.time = item_key.substring(0,2)+":"+item_key.substring(0,4)+":"+item_key.substring(4,6);
					}
					else {
						errors+='cannot derive time for '+item_path+" \n";
					}
				}
				this_item.tmp.date = fun.get_date_or_stated_date(this_item, "saving "+item_key+" to cache");
				if (this_item.tmp.date===null) this_item.tmp.date = selected_year + "-" + selected_month + "-" + selected_day;
				items.push(this_item);
				//for (var field_key in this_item) {
					//if (this_item.hasOwnProperty(field_key)) {
						//var val = this_item[field_key];
						//var val = items[field_key];
						//console.log("    " + field_key + ": " + val);
					//}
				//}
				if (errors.length>0) req.session.error = errors;
			}
			catch (err) {
				req.session.error = "\nCould not finish reading "+item_path+": "+err;
			}
		}
		else console.log("\nSkipped "+item_path+": not a data file");

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
```

* Deprecated (was not being used)
```javascript
function get_transaction_years(unit, section, table) {  // formerly get_years
	var section_path = storage_path + "/units/" + _selected_unit + "/" + section;
	var category_path = section_path + "/transactions";
	var table_path = category_path + "/" + table;
	var year_month_string = moment().format("YYYY-MM");
	var years;
	if (!(dat[section]&&dat[section].years) || !listed_year_on_month || (listed_year_on_month!=year_month_string)) {
		listed_year_on_month = year_month_string;
		if (fs.existsSync(table_path)) {
			if (!dat[section]) dat[section] = {};
			years = fun.getVisibleDirectories(table_path);
			dat[section].years = years;
			//for (var y_i = 0; y_i < years.length; y_i++) {
				//var this_year = years[y_i];
				//dat[section][this_year] = {};
			//}
		}
	}
	else years = dat[section].years;
	return years;
}

```

* Deprecated (was not being used)
```javascript
function get_year_buttons_from_cache(unit, section, table, username) {
	var ret = "";
	var years = get_transaction_years(_selected_unit, section, table);
	for (var i=0, len=years.length; i<len; i++) {
		ret += '<form action="'+config.proxy_prefix_then_slash+'" method="get">';
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
```

* Deprecated (use variables by same name instead)

	```javascript
			prefill_form_field: function(fieldname, opts) {
				if (fieldname in prefill_data)
					return fieldname["prefill_data"];
				else
					return "";
			},
			prefill_name: function(opts) {
				if (prefill_data.name)
					return prefill_data.name;
				else
					return "";
			},
			prefill_first_name: function(opts) {
				if (prefill_data.first_name)
					return prefill_data.first_name;
				else
					return "";
			},
			prefill_last_name: function(opts) {
				if (prefill_data.last_name)
					return prefill_data.last_name;
				else
					return "";
			},
			prefill_reason: function(opts) {
				if (prefill_data.reason)
					return prefill_data.reason;
				else
					return "";
			},
			prefill_chaperone: function(opts) {
				if (prefill_data.chaperone)
					return prefill_data.chaperone;
				else
					return "";
			},
			prefill_grade_level: function(opts) {
				if (prefill_data.grade_level)
					return prefill_data.grade_level;
				else
					return "";
			},
			prefill_family_id: function(opts) {
				if (prefill_data.family_id)
					return prefill_data.family_id;
				else
					return "";
			},
			prefill_stated_time: function(opts) {
				if (prefill_data.stated_time)
					return prefill_data.stated_time;
				else
					return "";
			},
			prefill_stated_time: function(opts) {
				if (prefill_data.stated_date)
					return prefill_data.stated_date;
				else
					return "";
			},

	```

* Deprecated (use user_has_section_permission instead)

	The permission method below (being deprecated) uses a list of users for each section in each permission.

	```javascript
	var create_groups = {}; //which users can create entries in which section
	//Any usernames added to groups via code should be created (using the create username form while web app is running) before web app is made accessible to anyone other than those setting up the web app.
	create_groups["care"] = ["admin", "accounting", "care"];
	create_groups["commute"] = ["admin", "attendance", "commute"];

	var read_groups = {}; //which users can read all data from which section
	//care should see care info (who has logged in or out of care so far) but NOT costs, but commute user (students) should not see other commutes:
	read_groups["care"] = ["admin", "accounting", "care"];
	read_groups["commute"] = ["admin", "attendance"];

	var modify_groups = {}; //which users can modify existing data in which section
	modify_groups["care"] = ["admin", "accounting"];
	modify_groups["commute"] = ["admin", "attendance"];

	var _pinless_custom_time_groups_by_section = {};
	_pinless_custom_time_groups_by_section["care"] = ["admin", "care", "accounting"]; //allow these groups to enter a different time for care
	_pinless_custom_time_groups_by_section["commute"] = ["admin", "attendance"]; //if part of one of these groups

	function user_has_pinless_time(section, username) {
		var result = false;
		if (section in _pinless_custom_time_groups_by_section) {
			if (contains.call(_pinless_custom_time_groups_by_section[section], username)) {
				result = true;
			}
		}
	}
	```

	NOTE: user_has_pinless_time can be replaced by:

	```javascript
	user_has_section_permission(username, section, "customtime")
	```

* Deprecated by splitext in functions.js:
	```javascript
	exports.without_ext = function(path) {
		var result = path;
		//does account for multiple dots
		if (exports.is_not_blank(path)) {
			var breadcrumbs = path.split('/');
			var name = breadcrumbs[breadcrumbs.length-1];
			var chunks = name.split('.');
			result = "";
			if (name.substring(0,1)==".") result="."; //if starts with dot
			var last_index = chunks.length-2;
			if (last_index<0) last_index = 0;
			for (i=0; i<=last_index; i++) {
				result += chunks[i] + ((i==last_index)?(""):("."));
			}
		}
		//console.log("without_ext: "+path+" becomes "+result);
		return result;
	}
	```
