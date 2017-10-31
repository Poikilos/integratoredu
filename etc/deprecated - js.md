# Deprecated code

Deprecated (use variables by same name instead)

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

Deprecated (use user_has_section_permission instead)

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
