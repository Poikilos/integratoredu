# IntegratorEdu
Tracker for learning community micro events (changes or interactions that occur more frequently than once a day)
http://github.com/expertmm/integratoredu

This web app is under heavy development. Please use a release version (releases are, however, not production ready) by clicking "release(s)" above.
For release notes, see a release or the "etc" folder.

## Key Features
* Bill parents/guardians for minors who come before school or stay after school
* Track students who come to school late or leave early (for attendance purposes)
* Makes a sound (on operating systems where available, such as Linux and possibly Windows and Mac OS X; not tested on Android; doesn't seem to work on older iPads)

## Upgrade Instructions
* use etc/upgrade-data-20171008 to migrate to the intermediate structure used by all versions before Nov 9.

## Install Instructions
### On a GNU/Linux System (recommended)
* For security, data files and config.js are theoretically impossible to access via the web since app.js does not create any route to the data folder. However, check with your organization policies before using this program. Pins are stored as plain text in a config.js (see "Universal post-install steps (required)" below), and student information (in whatever way parent/guardian types their first name, last name, and grade and parent/guardian name--however they can type mom or poppop or anything you want in the "Pickup/Dropoff by" field) is stored in plain text data files (as .yml files) on your server. You should use ssl (https protocol) with this app to avoid post data being transmitted across your network (or internet via your remote server) unencrypted.
* make sure you have node.js installed
* then in the repo folder which contains app.js run the following in terminal to download dependencies (after making sure you have npm installed):
```
npm install
```
* to run the app, do the following in terminal in the repo folder:
```
chmod +x ./etc/noscreen  # this only has to be done once
./etc/noscreen
```
OR, if you have installed the screen package, instead do:
```
chmod +x ./etc/startiedu  # this only has to be done once
./etc/startiedu
```
* install mongodb
* mongodb may not start automatically, in which case you must start the service. `chmod +x ./etc/mongo-start && ./etc/mongo-start` may or may not work for you depending on your linux distro. Run the command again after restart or enable mongodb to run on startup using your services tool for your operating system.

### Universal post-install steps (required)
* make a data folder in same folder as app.js
	* place a new file called config.js in that data folder, and paste the following:
```
// config.js
// This file contains private configuration details.
// Do not add it to your Git repository.
module.exports = {
  "mongodbHost" : "127.0.0.1",
  "proxy_prefix_then_slash" : "/",
  "office_pin" : "",
  "it_pin" : "",
  "debug_enable": "true",
};
```
	* edit config.js and put a pin in the value for office_pin and it_pin (who gets these pins is explained below under Usage)
	* it_pin (aka "admin pin") is required for creating new users
	* office_pin should be only given to the front desk and/or attendance person (this pin is required for entering custom times when user's group, such as in the case of the commute user, does not have the customtime permission)--this should not be given to students since it allows them to state when they signed in/out (fills stated_time field, which overrides actual time in history and reports)
* before forwarding ports, go to http://localhost:8080 and immediately create new users named admin, care, commute, attendance, and accounting
* open port 8080 on your computer's firewall
* using your router's interface, forward port 8080 to your computer.
* if port 8080 is already used by another service, search for 8080 in app.js and change it.
* make additional users if there is more than one person for each managing role.
(for example there is not a user who can read but not edit commute history, but you can create one by creating a new group, putting a new username in the group, and changing that property of the permissions object in the code so that group has read permission for commute section [until groups.yml and permissions.yml are implemented, in which case do it there])

## Usage
* The purpose of the care section is for billing parents/guardians for minors who come before school or stay after school. The billing feature is implemented for this section.
* The purpose of the commute section is to track when students came late or leave early, for attendance purposes (front desk person should ensure that student signs in/out using a computer or tablet device, and students coming late or leaving early should only be allowed to enter/exit via the front desk person).
* care group (and user of same name) is for parents to use when signing in/out students such as with your tablet computer managed by a care workers (only the workers should know the password)
	* care has the customtime permission, so that care workers can enter the time someone signed the minor in or out--parents should normally do this to avoid client issues where time is debated when they are billed. Parents can enter a custom time while logged into your tablet as care, so if that doesn't meet your security needs, remove the customtime permission from the care group (this will require worker to enter the office_pin in order to enter a custom time) by changing that property of the permissions object in app.js (or permissions.yml if that is implemented).
* commute group (and user of same name) is for students (any student, commuter or not) to sign in/out at the front desk when they come to school late or leave early (they can know the password but this is not necessary if front desk worker makes sure that they are logged into the app and sign in/out using the commute form)
* attendance group (and user of same name) manages and edits the commute history (password should only be known to attendance personnel)
	* this username can be used to enter old commute data (such as from paper sign in/out sheet where students signed) without the time/date override pin
* accounting group (and user of same name) manages and edits the care history (very important--only accountant should have this password)
	* instructions for accounting person:
		* this username can be used to enter old care data (such as from paper sign in/out sheet where parent/guardian signed in/out minors from before or after school care) without the time/date override pin
		* before billing, resolve issues in the "Reports" section:
			* At the top right under "Report Settings," change the hourly rate for care, the time when before school charges end, and the time when after school charges begin.
			* click each month, then deal with fields marked with red or orange buttons in the row that has the problem.
			* add a FamilyID to each family, then click Autofill All.
			* if the family has no charge, make the family ID a negative number (or any sequence of characters starting with a hyphen).
			* If any FamilyID remains blank, enter a family ID then do Autofill All again.
			* To edit any fields manually, click the name of the name of the column at the top of the Reports sheet, scroll down, change the value that is in the text box, then push the Save button that is inside the same cell as the text box.
			* If Autofill worked in one month and not another, the function gathered missing data when you clicked it for the one that worked, so go back to the month that didn't work and do Autofill All again (if fields are still blank, resolve any remaining issues, otherwise manually enter family id since there must be a mispelling--this will allow that mispelling to be autofilled the next time the person signs in/out).
		* If you believe an entry is not valid, click the "x" to the left of the entry to deactivate it. Click any gray symbol to reactivate the item, however keep in mind that the gray symbols have the following meanings:
			* gray two-tag symbol: item was marked as a duplicate by user (Modified column shows who marked the duplicate)
			* gray list symbol: item was split by user (Modified column shows who split the entry)
			* gray 'x' with circle: manually deactivated by user using the "x" (NOTE: the file for the entry contains a hidden record of which user changed the state of an entry)
		* after all issues are resolved, click a year under "Billing"
			* type a name for a new billing cycle (whatever name you want) such as "2017 Sep and last week of Aug" and check all weeks that you would like to add to the billing cycle, then click the green plus button to create the billing cycle (this only has to be done once per billing cycle)
			* to view bills to give to parents or for your own use:
				* click the billing cycle that you named under "Billing Cycles" (or, if you didn't name it, click the number)
				* print the page for your records (Ctrl P, then choose a printer, or for PDF, choose Print to PDF and save it)--this is your report, so like with any report, it should be printed or saved for your financial records. Each Invoice (per family id) will appear on a separate page.
				* The last page will list remaining issues:
					* manually-entered times are converted to 24-hr time. You may need to verify these, but this is not a problem unless you suspect that manual entries were abused or entered incorrectly. If the manually entered date (+12 if PM) differs from the 24-hr date, please create an issue on the developer's website: <http://www.github.com/expertmm/integratoredu> (if doesn't already appear in the "Issues" tab). 
		* If you find a bug:
			* go to <http://www.github.com/expertmm/integratoredu>
			* before entering an issue, search for the issue under "Known Issues" in the README.md and see if the problem is considered minor (is preceded by "(~)") and if so there is no need to report the issue--long-term requests will be considered at a future date.
			* click "Issues" at the top of the webpage. If your issue is not already listed, submit a new issue (make sure "Title" field summarizes the problem well)

## Changes
* (2017-11-20) (in home.handlebars: made date a regular div instead of a navbar so it prints, and made day selector panel not print; set force_date_enable to false in show_history helper) improved printability of history
* (2017-11-20) improved duplicate detection further (do not count entries for care that are neither before nor after school, and mark price in red)
* (2017-11-20) made get_care_time_info use tmp.time (which is derived from whatever source is available)
* (2017-11-17) changed sheet friendly name for =careprice() from "Accrued" to "Accrued per 1" to annotate that qty (aka "Count") is not a part of that calculation
* (2017-11-17) small th (table heading) to fit better, and added more friendly names for formulas (they are shorter now)
* (2017-11-17) remove =caretime() (seconds) from section_sheet_fields.care since calculation (span_info) is now available to other formulas regardless of whether caretime is used
* (2017-11-17) button to change date to date of folder (in case of records written during bug that ended today) see also "should have button to move file to correct day"
* (2017-11-17) (put call to show_billing_cycle_preview inside check for "reports" mode) avoid repeatedly showing result of username+' does not have permission to access '+mode+' in this section' in console when user doesn't have reports permission for section
* (2017-11-17) (changed all instances of "for (i=" to "for (var i=") fix infinite loop in history
* (2017-11-17) (added parenthesis to quantity matching case in split-entry route to fix logic) prevent split-entry from trying to write values where index is out of range (causes yaml to write bad yaml syntax with html tag denoting error)
	* (2017-11-20) add option to change last name with one space to last name with no space (in case of entry error or mobile device auto error)--example: suggests changing mc donald to McDonald (and does capitalization automatically), but only when there is only one space
* (2017-11-17) (for transaction entry loading (all instances of yaml.read* pertaining to transactions) always create and use item.tmp.date and item.tmp.date check for stated_date or stated_time too (get_date_or_stated_date), and if still null, derive time from 6-character+ext filename and derive date from path) duplicate detection should not check different days in case of malformed record; also directly resolves (incorrectly diagnosed bug): mark as...Duplicate... button shoud not appear if either item_i or dup_index are in wrong date folder
* (2017-11-17) (!) only write ctime if write_mode is "create" (and consolidated code for generated field and added warning for unknown write_mode)
* (2017-11-17) (use get_date_or_stated_date instead of path for *item.tmp.year, *item.tmp.month, and *item.tmp.day) split-entry was putting new date instead of old date into new entries
* (2017-11-16) should only search current day for duplicates (using date_from_path tmp variable)
* (2017-11-16) enabled checking for visual_debug_enable in config.js (WARNING: enables some extra non-sensitive data to be displayed to user in some places)
* (2017-11-16) created repair script moveit.py (place it in a day folder and run it: it will move file to correct dated folder, and remove redundant stated_date [same as date from ctime])
* (2017-11-16) skip files without .yml extension in data folders
* (2017-11-16) improved behavior of "create" write_mode (fails if file exists already [although push_next_* methods try again with new index], unless custom_file_name_else_null is null, in which case add hyphen and number)
* (2017-11-16) in case of invalid stated_date in record during write_record_without_validation, added error checking and console message and reversion to current year, month, and/or day directory.
* (2017-11-16) (fixed not finding friendly name during missing field message generation--see "member that is same of a variable name" in regression tests) show friendly name in missing fields error
* (2017-11-16) (removed redundant calls) (~) get_care_time_info runs multiple times per entry during month report
* (2017-11-15) cleaned up time counting code for billing reports (multi-week list now can display values since subtotal logic [see use of key_totals_by_end_date] is corrected)
* (2017-11-15) added "Mark as Duplicate" button
* (2017-11-15) corrected usages of fun.splitext result
* (2017-11-15) show multiple initials where appropriate
* (2017-11-15) added invoicing by adding then viewing billing cycles (click Year in reports for a section where enabled--care by default)
* (2017-11-15) migrated to 0.2.0 file structure. Instructions (MUST be done in this order): stop integratoredu, upgrade integratoredu, run `chmod +x ./etc/upgrade-data-20171008 && ./etc/upgrade-data-20171008`, start integratoredu whenever you want.
* (2017-11-15) repaired scrollto (was using ssf_i, named anchor should be generated using item_i, and only place in first column where ssf_i is 0)
* (2017-11-15) fixed issue where non-string sent to peek_object (including indirectly via has_setting) causes major error (now, warning is shown in console instead and string operations are not attempted)
* (2017-11-14) autofill now normalizes values (by using list where good value as key such as care.autofill_equivalents.grade_level["K5"]) [in cases where change_record_object_enable param for autofill is true where appropriate such as new entry or Autofill All button]
* (2017-11-14) delete quantity (`delete new_item.qty;`) on items created by split-entry route
* (2017-11-14) account for alternate values using equivalents table (where set in settings) for each possible expected value of each field name
* (2017-11-08) 12:15PM changed data structure and modified /etc/upgrade-data-20171008 migration script. Instructions (MUST be done in this order): shut down integratoredu, upgrade integratoredu, run `chmod +x ./etc/upgrade-data-20171008 && ./etc/upgrade-data-20171008` (then you can start again)
	* now structure for each microevents folder is: var filedb_name=microevents; var category_name="student"; storage_path+"/units/"+unit_i+"/"+filedb_name+"/"+category_name
	(settings for each campus or company would go in different unit folders)
	* settings.yml becomes unit.yml in the unit folder (since every setting, especially timezone, could be different at other campus)
* (2017-11-08) changed data structure and made /etc/upgrade-data-20171008 script for migrating data saved before that. Instructions (MUST be done in this order): shut down integratoredu, upgrade integratoredu, run `chmod +x ./etc/upgrade-data-20171008 && ./etc/upgrade-data-20171008` (then you can start again)
* (2017-11-08) data_dir* variables renamed to storage*; signs_dir* renamed to table* for consistency
* (2017-11-06) Autofill All button, and "ribbon" (interface elements above the report) layout improvement
* (2017-11-06) remove all commented code after peek_settings lines (since they are replaced by peek_settings successfully)
* (2017-11-06) remove all commended code mentioning _settings.hasOwnProperty (since switched to has_setting(dot_notation) successfully)
* (2017-11-06) (changed update-query to use has_setting function) fixed issue where update-query was using settings directly instead of triggering default search
* (2017-11-06) new setting section+"."+mode+".auto_select_month_enable" (if not specified, auto select is turned off for reports and on for all other modes). In addition, if selected_year, selected_month, or selected_day is explicitly a string which is equal to the word "(none)" (including parenthesis), autoselect will not be performed (such as if trying to select year in order to design a bill--the reason for this is that bills can include billing periods from multiple months)
* (2017-11-06) new setting section+".bill_iso_day_of_week" is what day the billing period ends each week (ISO day numbering is where 1 is Monday, 7 is Sunday)
* (2017-11-06) fixed issue where year was not selectable due to overzealous autoselect (was using = for comparison instead of == when checking for null selection)
* (2017-11-06) now can detect an optionally-splittable "human delimited value" where count of hdv in field is either 0 or same as the field specified by the setting section+".list_implies_multiple_entries"
* (2017-11-02) move file create code to componentized function that takes write_mode of "modify" or "create"
* (2017-11-02) make is_blank fault tolerant when receiving param that is a type other than string
* (2017-11-02) changed contains to array_contains for clarity (and made it a regular function instead of a silly, silly thing used only by array_contains.call.
* (2017-11-02) clear selected_* if changing section (avoid folder doesn't exist error)
* (2017-11-02) detect splittable entries by detecting "human delimited value" (see hdv_* variables in code) such as "smith, johnson, and doe" in fields usually unique to id, such as last name (can't hurt to split entries even if family_id is same for both entries)
* (2017-11-02) renamed variable "key" in report to "column_name" for clarity
* (2017-11-02) moved config.js to data to avoid confusion (for example, so not transferred to different servers if updating a server via ftp from test machine)
* (2010-10-31) "=mid(fieldname,start,end)" where start and end are indices in the value of field named fieldname can be used as a value in the section+".history_sheet_fields" array-- like spreadsheet software, character indices start at 1 and second param is inclusive end.
* (2017-10-31) repaired is_after_school and is_before_school logic by using local timezone to interpret moment() result (current time) and removing formatting from date string parsing and using full simulated date instead (prepending current date is compatible with DST since local_*_time variables should always be considered as the current timezone offset).
* (2017-10-31) changed moment requirement from "moment" to "moment-timezone" and did npm install moment-timezone (see https://momentjs.com/timezone/docs/ )
* (2017-10-30) removed use of deprecated endTimeString global in is_after_school
* (2017-10-30) eliminate use of deprecated startTime and endTime globals (changing local_end_time was changing startTime anyway)
* (2017-10-30) made universal change-section-settings which can change any setting that is directly in the section's object in settings (does check change-section-settings permission of that section for current user's group)
* (2017-10-30) replaced more instances of (_settings && _settings.hasOwnProperty(section) && _settings[section].hasOwnProperty("default_groupby")) with has_setting(section+".default_groupby") where default_groupby is variable name
* (2017-10-30) correct use of runme session variable (store in req.session instead of session, and passed to handlebars render)
* (2017-10-29) Changed writeSync to write for settings
* (2017-10-28) (made section variable /student-microevent) /student-microevent regression of undefined variable bug
* (2017-10-28) correct use of autofill cache
* (2017-10-28) finished migrating from id_user_within_microevent to _settings[req.body.section]["autofill_requires"][requirer]
* (2017-10-28) created settings mode (visible if group has settings priv for admin section; writable if user has poke-settings priv for admin section; admin group has this permission) which uses peek_settings and poke_settings functions and sees all settings
* (2017-10-28) correct use of selected_field
* (2017-10-25) (changed replace("+"+"&") to replace("+","&") to generate combined_primary_key (used only as cache entry name)) fix autofill_cache not saving
* (2017-10-20) generated field for editing (can't anymore, since shouldn't)
* (2017-10-20) finished care reports (and improved the layout)
* (2017-10-20) implement peek_settings and poke_settings (not always used yet)
* (2017-10-19) implement autofill_requires and autofill_cache (required by update query, checked and set by form entry), and deprecate id_user_within_microevent
* (2017-10-19) update-query form added to reports section (restricted to updating fields known to have uniquely identifying virtual combined primary key)
* (2017-10-19) change-microevent-field form added to reports section
* (2017-10-15) set value for key of day in dat manually after writing file to alleviate caching failure (see yaml.writeSync) -- logic for updating is still bad (see listed_* variables) since based on irrelevant information (read time) but should be unecessary now anyway.
	* caching problem is described as (cache is only loaded for specific user and never changed):
		* person with read priv views a page, and cache is loaded
		* person with create (not read) creates entry not written to cache but written to file
		* person with read priv views a page again, but cache is not modified
	* diagnosis:
		* cache wasn't updated when file is written to new day
* (2017-10-15) changed all instances of boolean check for "in" to hasOwnProperty to account for delete, since regardless of what people stackoverflow say, in practice using "in" returned undefined values for deleted members. See also https://stackoverflow.com/questions/8539921/javascript-is-a-member-defined and Juan Mendes answer on similar topic: https://stackoverflow.com/questions/14967535/delete-a-x-vs-a-x-undefined
	* except for parsed query objects like req.body, req.session, and req, which do not inherit from object and therefore don't have hasOwnProperty nor features of object which may lead to security issues.
* (2017-10-15) renamed choices_by_field to field_lookup_values
* (2017-10-14) changed permissions to use only two objects (_permissions and _groups) with universal permission checking function (user_has_section_permission)
* (<2017-10-13) should display all fields are missing if all fields are blank, instead of only showing heading is missing
* (2017-10-13) implemented prefill as object in session (gets passed to render and then to helper so that get_section_form form generator can use it)
* (<2017-10-13) Change Y/M/D selection to highlight current one using helper: https://stackoverflow.com/questions/13046401/how-to-set-selected-select-option-in-handlebars-template
* (<2017-10-13) (resolved by: check if user object exists in session) fix Exception on Logout if node instance has been restarted
* (2017-09-29) added new boolean config.audio_enable (see config.js) -- default is true -- for playing sound on success (success.wav), missing form data (missing-information.wav), or potential hacking attempt otherwise bug (security-warning.wav)
* (2017-09-29) added packages for image serving: url, http
* (2017-09-28) renamed group_*_fields to section_*_fields and group_fields_overrides to section_fields_overrides
* (2017-09-28) correct user_has_pinless_time function
* (2017-09-28) [URGENT security fix] remove prefill globals
* (2017-09-15) standardized UAC for pin vs no-pin custom date and custom time entry (istead of hard-coding name of group allowed to do no-pin)
* (2017-09-15) renamed transaction_type to transaction_section for clarity
* (2017-09-15) simplified but expanded potential of UAC by limiting group names to section names but having separate create_groups, read_groups, and modify_groups.
* (2017-09-01) do not allow making same username with different case, and allow different case when logging in
* (2017-08-31) condense and clean up web gui; make use of bootstrap classes
* (2017-08-31) trimmed redundant code from form handling now that form validation code and UAC are both based on predefined transaction_type and respective form specification
* (2017-08-31) fixed issues where prefill_data wasn't cleared (after failed form validation) and therefore: pin was used invisibly, or heading was detected as valid but then not able to be saved.
* (2017-08-31) proxy_prefix should work if value is blank (already works for forms; may need path join function of some kind for cases where redirect is "" if that doens't work)
* (2017-08-31) added more specialization for the two student-microevent entry forms
* (2017-08-30) implemented separate form for Commute logging (student arriving late or departing early)
* (2017-08-30) minute should be recorded correctly by using moment format string "HH:mm" (was all caps) --fixed sample data by changing everything at 3:* PM to 3:10 PM (15:10) -- see boom.py
* (2017-08-30) removed "student_" prefix from form variable names
* (2017-08-30) get_proxy_prefix_path helper should be prepended to action by handlebars to create correct form posting address
* (2017-08-30) renamed sign-student action to sign-extcare, renamed picked_up_by to chaperone, sign-extcare to student-microevent

## Regression tests
* see https://getbootstrap.com/docs/4.0/migration/
* always use item.tmp.date (which is derived during load) instead of manually deriving date, to save on code and avoid having different logic for deriving date elsewhere other than at yaml.read*
* comparing an item to itself when not checking for NaN
* "for (i=" where should be "for (var i=" where i is any variable name (then check for lint and make sure another variable of same name in same scope doesn't exist otherwise rename the loop variable.
* for transaction entry loading (all instances of yaml.read* pertaining to transactions) always create and use item.tmp.date and item.tmp.date check for stated_date or stated_time too (always use get_date_or_stated_date), and if still null, derive time from 6-character+ext filename and derive date from path
* use of console.error (doens't exist, should be console.log)
* use of object sent to value checking method such as fun.is_true (where instead, member of object should have been sent)
* use of visual_debug_enable where should be fun.visual_debug_enable (or if in functions.js, then exports.visual_debug_enable)
* use of member that is same of a variable name (like when `var srf="first_name"; if (fields_friendly_names.srf) key_friendly_name = fields_friendly_names.srf;` is supposed to be `var srf="first_name"; if (srf in fields_friendly_names) key_friendly_name = fields_friendly_names[srf];`)
* use of function pointer as param or value (such as in manual traceback scenario where name of function was intended to be passed along)
* strip() should be trim() in javascript
* fun. should be exports if in functions.js; whereas if in any other file, exports. should be fun.
* fun.fun. should be fun. no really that could be type-o for calls to functions.js
* remember that javascript string substring method takes slice-like params (start, endbefore [NOT length]) 
* use of `fun.file_name_no_ext(s)` where actual code should be `fun.splitext(s)[0]` (autocomplete error)
* Quote in end tag (such as '</div">')
* Check against http://www.bootlint.com
* req.session.info should instead be req.session.notice
* req.body, req.session, and req.query can be iterated with for, however they do not have the function hasOwnProperty so that should not be tried.
* uses of else else where should be else
* uses of = instead of == for comparison (other than loops conditions, if used correctly)
* uses of methods in functions.js without object where it was imported (for example, app.js should never contain the string "(isblank" but instead "(fun.isblank")
* forms where action is not specified
* forms where method is not specified, including in handlebars like ```<form action="{{get_proxy_prefix_then_slash}}">```
* literal uses of sections (where section or req.session.section or similar variable should be used instead)
* uses of peek before has_setting if value is in defaults (has_setting should be used first since loads default and saves settings to file, if default exists)

### Regression tests no longer needed:
* splitting and qty (see etc/07_regression_test/02)

## Known Issues
!=high-priority
~=low-priority
?=needs verification in current git version
* make "Reload Settings" work; make it a route and not a mode; make a "global" section in the admin mode panel and add Reload Settings to that
* track extended days (modified start times) for after school programs (group expires after term), by student group and date range, such as:
  ```
  term_info:
  - 2017-2018:
    student_groups:
    - name: art_club
      start_date: 2017-09-01
      end_date: 2017-09-30
      end_time: 16:00:00
  #end_time for program is used as the start time for care price
  ```
* track half days (such as, if a student is signed out of care at 3:05pm on a half day, the charge should be for 3hrs5mins, not 0hrs)
	* track half days by value group (must be normalized during this process--see section+".autofill_equivalents" in settings), such as valuegroups.grade_level.elementary={"K5","1","2","3","4","5","6"}
* restore duplicate detection (see 2017-11-20 15:46:25 and 15:46:32 in expertmm private test data)
* when students matriculate, their grade in autofill should be corrected--their graduation year should be tracked somehow so that autofill works for the next school year.
* should have button to move file to correct day
* most section-specific or even unit-specific variables (such as default_total) should be moved
* permissions should specify unit_id (to determine which campuses the person can select [and which is their default, otherwise make campus priority list])
* make section priority list able to be different for each unit
* (!) add autofill all to reports when has selected_month
* (?) doesn't load new month on month change (keeps existing months lists instead, until restart)
* add mongodb database backup and restore feature
* make flexible peek_config and poke_config functions (and modify _peek_object and _poke_object so) that don't assume any of the following: _settings, _settings_default, and settings_path
* if bad input, node-yaml (not to be confused with js-yaml) saves a file that cannot be read, so when read is attempted, and an exception is shown to user containing the bad data, but only the one line of the file:
  see etc/08_regression_test/31/050359.yml
  which includes a bad value for time that was saved by node-yaml (these bad values were saved only during a glitch between commits, probably related to using moment wrongly, otherwise for an unknown reason):
  ```yaml
  time: !<tag:yaml.org,2002:js/undefined> ''
  ```
  reading back the file (when the day is loaded by integratoredu) results in the following error shown to the user:
```
Could not finish reading data/care/2017/08/31/050359.yml: YAMLException: unknown tag !<tag:yaml.org,2002:js/undefined>; at line 5, column 43:
     ... g:yaml.org,2002:js/undefined>; &#x27;&#x27;
                                         ^
```
* trim values after loading (for example, family_id may contain spaces in quoted YAML string)
* (!) keep only earliest time for date, so doesn't add multiple charges to family for same day if entered multiple times accidentally
* can't load defaults using new use of scoping in has_setting
* for attendance user, can view reports, but can't select field, and app shows link to select time (even though stated_time, the override for it, is not present) instead of noticing missing override and not showing field name as link
* implement a way to change the date (and make sure file is moved and cache is modified)
* move "Reload Settings" from title bar to to settings form (which is displayed only in settings mode)
* a discrepency exists between reload settings and setting file and memory (not sure how--to reproduce, change setting in file, reload settings)
* remove commented id_user_within_microevent code
* Download spreadsheet separated by family (with formula in fields where appropriate)
* SmartTuition bills on the 5th, 20th, and last day of month (must enter the stuff into SmartTuition manually before one of those dates for bill to go on that email)
* (2017-10-20 changed display name for =get_date_from_path() from Date to Stored, using Stored still allows selecting it) fix issue where display name for =get_date_from_path() was Date, a real field, allowing user to select a * save autofill_cache to file or database
* selecting time gives success message, but doesn't provide editing form
* trigger a backup before update-query
* session.runme and other direct usages of session as if it were a session (as opposed to using req.session) may not be ok
* There is no code to serve the wav files referenced by the javascript that is in body onload after an error occurs.
html tag) data is written sometimes (but not anymore?)
* Edit button should prefill the "create" form and additionally store date and primary key in hidden fields (pass along and use all prefills the same way prefill_mode is used correctly, ensuring variables are either defined or passed along in prefill object)
* history viewing should use res.write so that all sections can use the same handlebars code (and so columns can be aligned regardless of order)
* find out why items aren't being cached--can't see days past current day (see "find out why this doesn't work" in code)
	* Should save timestamp for each time day in entire data folder's dated filesystem is modified (see "if (selected_day)" in app.js), so doesn't relist files for day each time a backend ("read" group) page is loaded -- get timestamp with decimal seconds like: moment().format('X')
* Should block non-alphanumeric usernames from being created
* implement ".get_date()" function as field (get date from dated folder names)
* for export, only fields from group_sheet_fields_names should be used (others displayed as gray on preview). SmartTuition requires (you have to email them the spreadsheet): Family ID, FirstName, LastName, GraveLevel, Total
* implement overrides for editing and sheets--see group_fields_overrides (for editing, use stated time, but only if stated time exists. Also, only allow editing "time" field)
* allow changing password (see "This is how to change the password" in app.js)
* type password twice to verify during registration
* care form should have a drawing pad for signing
* pin should be stored in database, encrypted
* improve form repopulation such as with express-forms, or flashify as per Jason Gelinas at https://stackoverflow.com/questions/10706588/how-do-i-repopulate-form-fields-after-validation-errors-with-express-form
* Clicking create account followed by "I have an account..." leaves both the New and login subpanels open (each is only closed by clicking again on the same button)
* fix callback for yaml.write so it can be used, instead of yaml.writeSync and req.session.notice.
* (?) cache checking code during page load was not using hasOwnProperty but rather "!" operator -- this may be a problem even though 0 is never a year, month, or day.
* (?) Reading incorrectly formatted YAML can crash app on line: yaml.readSync(item_path, "utf8"); -- for some reason bad (some kind of error flag that looks like an
* (~) Billing cycle file is read twice without manually caching---see `cen_entry = get_table_entry(section, category, selected_number);`
* (~) validate date by exploding by slash or hyphen, then adding zero padding.
* (~) bootstrap nav isn't used correctly (subtags do not utilize the nav class) -- see https://v4-alpha.getbootstrap.com/components/navbar/
* (~) Change section chooser from button to drop-down: https://www.w3schools.com/bootstrap/bootstrap_dropdowns.asp
* (~ partially resolved by having section name have display name [friendly_section_names]) display_name should be saved in database, so that the invisibly enforced lowercase restriction doesn't make everyone's username appear as lowercase
* (~) serve files from database (browser shows missing image symbol, and show image in new tab says "http://192.168.1.5/sign/users/profilepics/admin.jpg" where http://192.168.1.5/sign is a working reverse http proxy redirect that points to node running on 8080)
* (~) sheet functions do not support overrides


## Planned Features
* clear cache method (set these globals to null):
listed_year_on_month = null;
listed_month_on_date = null;
listed_day_on_date = null;

* overtime penalties?
* autocomplete history
* record a copy of each report exported in order to retain record in case data is changed later
    * it could contain an automatic subreport of any changes made outside of the date range specified, and also automatically display that subreport.
* display legal notices including restraining orders for the student in focus during clock out process
* implement bar code reader for family id (and fill in appropriate fields)
* [commute] email a contact on each student-microevent
* [Employee Absence] Implement employee day off request page and page UAC
* [Employee Absence] Allow multiple groups per person such as for email groups used for Employee Absence
* Implement groups and default page for group
* [Devices] Implement Devices page with signin and signout of devices
* [Devices] Enter the following example devices: CamA, CamB, CamC, CamD, Chromebook1, Chromebook2, Chromebook3, Chromebook4, Chromebook5, Chromebook6, Chromebook7
* [Devices] implement a way to delete recently used individual people and individual devices
* [Devices] Implement import of EquipChan log
* [Extended Care] autocomplete family name and id (express-form? express-validator? --NOTE: express-form does validation too, via node-validator)

## Core Features
* Make program to log after school care hours (3:05 to signout time)
* Maximum 5:30 but still charge after that, and log warning
* Finger signin
* Keep track of who picked up who when & where (archive after 1yr)
* Sync with SmartTuition OR give total monthly (Current system is a physical log)
* (optional) email hours at end of week (summary not bill): requires email address field in family table
* CHILD table fields: family_id, first_name, last_name, grade
* PARENT table fields: family_id, first_name, last_name, email

## General Notes: SmartTuition:
* replaces ACS invoice created manually (but ACS still used for other things)
* does billing and handles all AR billing & collection
* Extended Care data import requires Family ID, Student First Name, Student Last Name, Grade, Total


## Authors
Jake Gustafson
see etc/howto.txt for more
see LICENSE file for license

## Developer Notes
* run `chmod +x ./etc/quality && ./etc/quality` in terminal to check the code quality--it will give instructions if missing outputinspector or kate (optional) or code quality tool
* To write a record, call write_record_without_validation after validating the form by any means necessary.
* as of 2017-10-08 make sure folder structure remains compatible with my php app MoneyForesight (so MoneyForesight's features can be eventually merged into IntegratorEdu)
  as per the following documentation:
  ```
  Any file or folder staring with "." is ignored.
  <data|root>/units/<unit_no>/unit.yml
  
  and data is stored as:
  <data|root>/units/<unit_no>/<filedb_name>/<table>/<primary_key>.yml
  * such as units/0/business/Contacts
  or
  <data|root>/units/<unit_no>/<filedb_name>/<table>/<year>/<month>/<day>/<files|folders>
  * such as units/0/care/microevents/student/0.yml
  
  and audit trail is stored as:
  <data|root>/units/<unit_no>/metadata/audit/<year>/<month>/<day>/<sequential_number>.yml
  where yml file contains all info to undo the change (location of data file and old value of any values that were changed).
  ```

### Coding choices
* Uses JSON.parse(JSON.stringify(x)) to copy object x and ensure no references to properties are copied to the new object

### Caching
"dat" is the cache object. It contains named year objects.
* each year object contains named month objects.
  Month object contains:
	* array named "day" containing day names
	* objects named according to values in "day" list
	  These day objects each contain:
		* array named "item_keys" containing primary keys (equal to filenames)
		* objects named according to values in "item_keys" list
			* which each contain entry fields

### Security
* use "req.sanitizeBody('name').escape();" from express-validator (see https://developer.mozilla.org/en-US/docs/Learn/Server-side/Express_Nodejs/forms )
* Security checking must be done using groups["group name"] where each group name contains an array of users
* student-microevent is only a group for display, not for security. 


### First-time setup
Requires nodejs package to be installed
To run (such as on Ubuntu Xenial): js app.js
OR (such as Antergos): node app.js
install system deps:
```
#on Ubuntu:
sudo apt-get install nodejs
sudo apt-get install mongodb
#(note: mondodb package includes both client and server on Antergos)
sudo apt-get install mongodb-server
sudo apt-get install npm
#on Ubuntu etc:
sudo service mongodb enable
sudo service mongodb start
#or on Antergos:
sudo systemctl enable mongodb
sudo systemctl start mongodb
if [ -d ~/Applications/integratoredu ]; then
  cd ~/Applications/integratoredu
else
  cd ~/Documents/GitHub/integratoredu
fi
#or on FreeBSD:
#edit /etc/rc.conf and add: mongodb_enable="YES"
#then
sudo service mongodb enable
#tell npm to get all dependencies (if no param after install, uses package.json to get list):
npm install
#on Ubuntu:
sudo ufw allow 8080
#BELOW IS ONLY NEEDED IF you want to also have apache installed:
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo cp ./share/etc/apache2/sites-available/sign.conf /etc/apache2/sites-available/
sudo service apache2 restart

```

Then initial setup of this repo required (never required to be typed again since these packages are in the dependencies list in app.js [in this version of npm they are added to the list automatically after npm install, where as --save must be specified in versions earlier than 5 such as on Ubuntu Xenial]):

DON't ACTUALLY do any of the stuff below--just do ```npm install``` instead (see above), which will read package names from package.json
```
cd ~/Applications/integratoredu
npm init
#NOTE: --save should really be used for all of these, so they are automatically added in the dependencies section of package.json
npm install express --save
npm install morgan --save
npm install body-parser --save
npm install errorhandler --save
npm install method-override --save
#now install deps that weren't mentioned in tutorial:
npm install bcryptjs --save
npm install express-handlebars --save
npm install passport --save
npm install passport-mongodb --save
#passport-local allows using a local database instead of social network login
npm install passport-local --save
npm install q --save
npm install cookie-parser --save
npm install express-session --save
#deps I added beyond the express mongodb local authentication tutorial:
npm install express-helpers --save
npm install moment --save
npm install fs --save
npm install js-yaml --save
#node-yaml is a wrapper for js-yaml and adds save feature:
npm install node-yaml --save
#see also: npm install moment-timezone --save
```
