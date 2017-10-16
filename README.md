# IntegratorEdu
Tracker for learning community micro events (changes or interactions that occur more frequently than once a day)
http://github.com/expertmm/integratoredu

This web app is under heavy development. Please use a release version (releases are, however, not production ready) by clicking "release(s)" above.
For release notes, see a release or the "etc" folder.

## Changes
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

## Known Issues
~=low-priority
?=needs verification in current git version
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
* (?) cache checking code during page load was not using hasOwnProperty but rather "!" operator -- this may be a problem even though 0 is never a year, month, or day.* (?) Reading incorrectly formatted YAML can crash app on line: yaml.readSync(item_path, "utf8"); -- for some reason bad (some kind of error flag that looks like an * (~) validate date by exploding by slash or hyphen, then adding zero padding.
* (~) bootstrap nav isn't used correctly (subtags do not utilize the nav class) -- see https://v4-alpha.getbootstrap.com/components/navbar/
* (~) Change section chooser from button to drop-down: https://www.w3schools.com/bootstrap/bootstrap_dropdowns.asp
* (~ partially resolved by having section name have display name [friendly_section_names]) display_name should be saved in database, so that the invisibly enforced lowercase restriction doesn't make everyone's username appear as lowercase
* (~) serve files from database (browser shows missing image symbol, and show image in new tab says "http://192.168.1.5/sign/users/profilepics/admin.jpg" where http://192.168.1.5/sign is a working reverse http proxy redirect that points to node running on 8080)


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
