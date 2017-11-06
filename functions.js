var bcrypt = require('bcryptjs'),
    Q = require('q'),
    config = require('./data/config.js'); //config file contains all tokens and other private info
fs = require('fs');

////// POLYFILLS //////

String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.split(search).join(replacement);
};

////// PASSPORT //////

// MongoDB connection information
if (!config.mongodbHost) config.mongodbHost = "127.0.0.1";
var mongodbUrl = 'mongodb://' + config.mongodbHost + ':27017/users';
var MongoClient = require('mongodb').MongoClient;

//used in local-signup strategy
exports.localReg = function (username, password) { 
  var deferred = Q.defer();
  if (username) {
    if (password) {
        username = username.toLowerCase();
        MongoClient.connect(mongodbUrl, function (err, db) {
		if (db) {
			var collection = db.collection('localUsers');
			//check if username is already assigned in our database
			collection.findOne({'username' : username})
			.then(function (result) {
				if (null != result) {
					console.log("USERNAME ALREADY EXISTS:", result.username);
					//This is how to change the password by deleting the user--it will say already exists, but then after that they can sign up again (but don't use this code--modify the collection instead--removing the collection removes all users)
					//if (result.username=="attendance") {
					//    console.log("DELETING attendance");
					//    collection.remove(); //removes all users!
					//}
					deferred.resolve(false); // username exists
				}
				else {
					var hash = bcrypt.hashSync(password, 8);
					var user = {
						"username": username,
						"password": hash
						//"avatar": "sign/users/profilepics/" + username + ".jpg"
					}

				console.log("CREATING USER:", username);

					collection.insert(user)
					.then(function () {
					db.close();
					deferred.resolve(user);
					});
				}
			});
		}
		else {
			user = {};
			if (err) user.error = err;
			else user.error = "Cannot connect to database (database did not reply with error).";
			console.log("localReg CANNOT CONNECT TO DATABASE: " + user.error)
			deferred.resolve(user);
		}
        });
    }
    else {
        console.log("localReg: MISSING PASSWORD")
        deferred.resolve(false);
    }
  }
  else {
    console.log("localReg: MISSING USERNAME")
    deferred.resolve(false);
  }

  return deferred.promise;
};

//check if user exists
    //if user exists check if passwords match (use bcrypt.compareSync(password, hash); // true where 'hash' is password in DB)
      //if password matches take into website
  //if user doesn't exist or password doesn't match tell them it failed
exports.localAuth = function (username, password) {
  var deferred = Q.defer();

  MongoClient.connect(mongodbUrl, function (err, db) {
      
    var collection = db.collection('localUsers');
    if (username!==null && username!==undefined && username.length>0) username = username.toLowerCase();
    collection.findOne({'username' : username})
      .then(function (result) {
        if (null == result) {
          console.log("USERNAME NOT FOUND:", username);

          deferred.resolve(false);
        }
        else {
          var hash = result.password;

          console.log("FOUND USER: " + result.username);

          if (bcrypt.compareSync(password, hash)) {
            deferred.resolve(result);
          } else {
            console.log("AUTHENTICATION FAILED");
            deferred.resolve(false);
          }
        }

        db.close();
      });
  });

  return deferred.promise;
}







////// GENERAL FUNCTIONS ///////



//from Titlacauan on https://stackoverflow.com/questions/18112204/get-all-directories-within-directory-nodejs
exports.getDirectories = function(path) {
	return fs.readdirSync(path).filter(function (file) {
		return fs.statSync(path+'/'+file).isDirectory();
	});
}

exports.getFiles = function(path) {
	return fs.readdirSync(path).filter(function (file) {
		return !fs.statSync(path+'/'+file).isDirectory();
	});
}
//versions below ignore if starting with "."
exports.getVisibleDirectories = function(path) {
	return fs.readdirSync(path).filter(function (file) {
		return fs.statSync(path+'/'+file).isDirectory() && (file.substring(0,1)!=".");
	});
}

exports.getVisibleFiles = function(path) {
	return fs.readdirSync(path).filter(function (file) {
		return !fs.statSync(path+'/'+file).isDirectory() && (file.substring(0,1)!=".");
	});
}

exports.contains = function(haystack, needle) {
	return haystack.indexOf(needle) > -1;
}

exports.array_contains = function(haystack, needle) {
	//NOTE: do NOT use haystack.includes(needle), since that is hidden behind harmony flags in node.js for backward compatibility
	// Per spec, the way to identify NaN is that it is not equal to itself
	var findNaN = needle !== needle;
	for (i=0,len=haystack.length; i<len; i++) {
		var item = haystack[i];
		if ((findNaN && (item !== item)) || item === needle) {
			return true;
		}
	}
	return false;
}

exports.zero_padded = function(str, len) {
	var result = str;
	if (typeof(str)!="string") result = ""+str;
	while (result.length<len) result = "0"+result;
	return result;
}

exports.without_ext = function(path) {
	var result = path;
	//does account for multiple dots
	if (exports.is_not_blank(path)) {
		var breadcrumbs = path.split('/');
		var name = breadcrumbs[breadcrumbs.length-1];
		var chunks = name.split('.');
		result = "";
		var last_index = chunks.length-2;
		if (last_index<0) last_index = 0;
		for (i=0; i<=last_index; i++) {
			result += chunks[i] + ((i==last_index)?(""):("."));
		}
	}
	//console.log("without_ext: "+path+" becomes "+result);
	return result;
}

/*
//function by eyelidlessness on <https://stackoverflow.com/questions/1181575/determine-whether-an-array-contains-a-value> 5 Jan 2016. 31 Aug 2017. 
//var array_contains = function(needle) {
exports.array_contains = function(needle) {
    // Per spec, the way to identify NaN is that it is not equal to itself
    var findNaN = needle !== needle;
    var indexOf;

    if(!findNaN && typeof Array.prototype.indexOf === 'function') {
        indexOf = Array.prototype.indexOf;
    } else {
        indexOf = function(needle) {
            var i = -1, index = -1;

            for(i = 0; i < this.length; i++) {
                var item = this[i];

                if((findNaN && item !== item) || item === needle) {
                    index = i;
                    break;
                }
            }

            return index;
        };
    }

    return indexOf.call(this, needle) > -1;
};
//used like:
//fun = require('./functions.js');
//var myArray = [0,1,2];
//var result = fun.array_contains.call(myArray, needle); // true
*/


exports.get_human_delimited_values = function(input_string) {
	var result = null;
	if (exports.is_not_blank(input_string)) {
		result = [input_string];
		if (input_string) {
			input_string = input_string.replaceAll(" and ", ",");
			input_string = input_string.replaceAll(" ", ",");
			input_string = input_string.replaceAll("&", ",");
			input_string = input_string.replaceAll("+", ",");
			//console.log("[ get_human_delimited_values ] removed:");
			while (exports.contains(input_string,",,")) {
				input_string = input_string.replaceAll(",,", ",");
				//console.log("  * ',,'");
			}
			if ((input_string.substring(input_string.length-1)==",")) input_string = input_string.substring(0,input_string.length-1);
			if (input_string.substring(0,1)==",") input_string = input_string.substring(1);
			//console.log("human delimited field as csv is: "+input_string);
			result = input_string.split(",");
		}
	}
	return result;
}



///returns: whether the haystack only contains characters from needle_chars_as_string
///(false if haystack has any other characters)
exports.only_contains_any_char = function(haystack, needle_chars_as_string) {
	var result = true;
	for (i = 0; i < haystack.length; i++) {
		//if criteria does not contain haystack (yes, this is correct), return false
		//NOTE: array_contains should also be ok since only one character is being looked for, and since each index of a string is a character
		//if (!exports.array_contains(needle_chars_as_string, haystack.substring(i,i+1))) {
		if (needle_chars_as_string.indexOf(haystack.substring(i,i+1))<0) { //if needle does not contain this character of the haystack (such if invalid character entered in field), return false
			result = false;
			break;
		}
	}
	return result;
}


exports.is_blank = function (str) {
	//if trimmed to a blank string, then is blank
	//not equal to self implies value is NaN in str!==str below--NaN is considered not blank.
	//regarding non-string tests below, see similar topic: https://stackoverflow.com/questions/19839952/all-falsey-values-in-javascript
	return (   ( (typeof(str)=="string") && str.trim()==="" )   ||   (  (!str) && (str!==false) && (str!==0) && (str!==-0) && (!(str!==str))  )   );
	//return str===null  ||  str.trim  &&  (  || (str.trim()==="") ); //|| (str===undefined) || (str===null) || (str==="") 
	//if (typeof(str)=="string") console.log("[ verbose message ] is string:");
	//else console.log("[ verbose message ] is not string:");
	//if (result) console.log("  [ verbose message ] is blank: "+str);
	//else console.log("  [ verbose message ] is not blank: "+str);
	//return result;
}

exports.is_true = function (str) {
	var str_lower = null;
	if ((typeof str)=="string") str_lower=str.toLowerCase();
	return (str===true) || ((str_lower!==null) && (str=="1"||str_lower=="true"||str_lower=="yes"||str_lower=="on"));
}

exports.is_not_blank = function (str) {
	//return str && str.trim();
    return !exports.is_blank(str);
}

exports.to_ecmascript_value = function (val) {
	var result = "\"<error reading variable>\"";
	if (val===null) result="null";
	else if (val===undefined) result="null";
	else if ((typeof val)=="string") result="\""+val+"\"";
	else result = JSON.stringify(val);
	return result;
}
