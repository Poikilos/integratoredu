# IntegratorEdu
Tracker for learning community micro events (changes or interactions that occur more frequently than once a day)
http://github.com/expertmm/integratoredu


## Changes
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
* implement ".get_date()" function as field (get date from dated folder names)
* for export, only fields from group_sheet_fields_names should be used (others displayed as gray on preview). SmartTuition requires (you have to email them the spreadsheet): Family ID, FirstName, LastName, GraveLevel, Total
* implement overrides for editing and sheets--see group_fields_overrides (for editing, use stated time, but only if stated time exists. Also, only allow editing "time" field)
* allow changing password (see "This is how to change the password" in app.js)
* repeat password on registration
* display_name should be saved in database, so that the invisibly enforced lowercase restriction doesn't make everyone's username appear as lowercase
* care form should have a drawing pad for signing
* pin should be stored in database, encrypted
* improve form repopulation such as with express-forms, or flashify as per Jason Gelinas at https://stackoverflow.com/questions/10706588/how-do-i-repopulate-form-fields-after-validation-errors-with-express-form
* Clicking create account followed by "I have an account..." leaves both the New and login subpanels open (each is only closed by clicking again on the same button)
* Don't know how to serve images (browser shows missing image symbol, and show image in new tab says "http://192.168.1.5/sign/users/profilepics/admin.jpg" where http://192.168.1.5/sign is a working reverse http proxy redirect that points to node running on 8080)
* Exception on Logout if node instance has been restarted (probably no fix exists for this, but make sure user loses credentials when server restarts in case point of restarting was resolving security issues in code)
* fix callback for yaml.write so it can be used, instead of yaml.writeSync and req.session.notice.

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
### Security
* Security checking must be done using groups["group name"] where each group name contains an array of users
* student-microevent is only a group for display, not for security. 
### First-time setup (no longer needed)
I may have more files in my ownCloud in www/Node
This git repository is usually pulled from ~/Applications resulting in ~/Applications/integratoredu folder.
### Running
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
#tell npm to get all dependencies (if no param after install, uses package.json to get list):
npm install
#on Ubuntu:
sudo ufw allow 8080
# BELOW IS ONLY NEEDED IF you want to also have apache installed:
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo cp ./share/etc/apache2/sites-available/sign.conf /etc/apache2/sites-available/
sudo service apache2 restart

```

Then initial setup of this repo required (never required to be typed again since these packages are in the dependencies list in app.js [in this version of npm they are added to the list automatically after npm install, where as --save must be specified in versions earlier than 5 such as on Ubuntu Xenial]):
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
