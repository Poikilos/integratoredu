# Deprecated code

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
