# IntegratorEdu
Tracker for learning community micro events (changes or interactions that occur more frequently than once a day)
http://github.com/expertmm/integratoredu

## Known Issues
* Clicking create account followed by "I have an account..." leaves both the New and login subpanels open (each is only closed by clicking again on the same button)

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
then

initial setup of this repo required (no longer required since in this version of node, these deps are placed in the deps:
```
cd ~/Applications/integratoredu
npm init
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
```
