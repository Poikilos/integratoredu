# IntegratorEdu
Tracker for learning community micro events (changes or interactions that occur more frequently than once a day)
http://github.com/expertmm/integratoredu

## Known Issues
* Clicking create account followed by "I have an account..." leaves both the New and login subpanels open (each is only closed by clicking again on the same button)
* Don't know how to serve images (browser shows missing image symbol, and show image in new tab says "http://192.168.1.5/sign/users/profilepics/admin.jpg" where http://192.168.1.5/sign is a working reverse http proxy redirect that points to node running on 8080)
* Exception on Logout if node instance has been restarted (probably no fix exists for this, but make sure user loses credentials when server restarts in case point of restarting was resolving security issues in code)

## Planned Features
* [Employee Absence] Implement employee day off request page and page UAC
* [Employee Absence] Allow multiple groups per person such as for email groups used for Employee Absence
* Implement groups and default page for group
* [Devices] Implement Devices page with signin and signout of devices
* [Devices] Enter the following example devices: CamA, CamB, CamC, CamD, Chromebook1, Chromebook2, Chromebook3, Chromebook4, Chromebook5, Chromebook6, Chromebook7
* [Devices] implement a way to delete recently used individual people and individual devices
* [Devices] Implement import of EquipChan CSV into device

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
sudo service mongodb start
#now allow node to run alongside apache in case you use apache:
sudo ufw allow 8080
sudo a2enmod proxy
sudo a2enmod proxy_http
cd ~/Applications/integratoredu
sudo cp ./share/etc/apache2/sites-available/sign.conf /etc/apache2/sites-available/
sudo service apache2 restart

```

Then initial setup of this repo required (never required to be typed again since these packages are in the dependencies list in app.js [in this version of npm they are added to the list automatically after npm install, where as --save must be specified in versions earlier than 5]):
```
cd ~/Applications/integratoredu
npm init
#NOTE: --save should really be used for all of these, so they are automatically added in the dependencies section of package.json
npm install express
npm install morgan
npm install body-parser
npm install errorhandler
npm install method-override
#now install deps that weren't mentioned in tutorial:
npm install bcryptjs
npm install express-handlebars
npm install passport
npm install passport-mongodb
#passport-local allows using a local database instead of social network login
npm install passport-local
npm install q
npm install cookie-parser
npm install express-session
#deps I added beyond the express mongodb local authentication tutorial:
npm install express-helpers
npm install moment
#see also: npm install moment-timezone --save
```
