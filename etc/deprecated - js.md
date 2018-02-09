# Deprecated code

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
