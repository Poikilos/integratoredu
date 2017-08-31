# IntegratorEdu
Tracker for learning community micro events (changes or interactions that occur more frequently than once a day)
http://github.com/expertmm/integratoredu


## Changes
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
* pin should be stored in database, encrypted
* improve form repopulation such as with express-forms, or flashify as per Jason Gelinas at https://stackoverflow.com/questions/10706588/how-do-i-repopulate-form-fields-after-validation-errors-with-express-form
* Clicking create account followed by "I have an account..." leaves both the New and login subpanels open (each is only closed by clicking again on the same button)
* Don't know how to serve images (browser shows missing image symbol, and show image in new tab says "http://192.168.1.5/sign/users/profilepics/admin.jpg" where http://192.168.1.5/sign is a working reverse http proxy redirect that points to node running on 8080)
* Exception on Logout if node instance has been restarted (probably no fix exists for this, but make sure user loses credentials when server restarts in case point of restarting was resolving security issues in code)
* fix callback for yaml.write so it can be used, instead of yaml.writeSync and req.session.notice.

## Planned Features
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
I may have more files in my ownCloud in www/Node
This git repository is usually pulled from ~/Applications resulting in ~/Applications/integratoredu folder.
Requires nodejs to be installed
run like: js app.js
install system deps:
```
sudo apt-get install nodejs
sudo apt-get install mongodb
sudo apt-get install mongodb-server
sudo apt-get install npm
sudo service mongodb start
sudo systemctl start mongodb
#now allow node to run alongside apache in case you use apache:
sudo ufw allow 8080
sudo a2enmod proxy
sudo a2enmod proxy_http
if [ -d ~/Applications/integratoredu ]; then
  cd ~/Applications/integratoredu
else
  cd ~/Documents/GitHub/integratoredu
fi
#tell npm to get all dependencies (if no param after install, uses package.json to get list):
npm install
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
