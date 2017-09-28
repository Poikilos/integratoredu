var bcrypt = require('bcryptjs'),
    Q = require('q'),
    config = require('./config.js'); //config file contains all tokens and other private info
// MongoDB connection information
if (!config.mongodbHost) config.mongodbHost = "127.0.0.1";
var mongodbUrl = 'mongodb://' + config.mongodbHost + ':27017/users';
var MongoClient = require('mongodb').MongoClient
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
					//This is how to change the password by deleting the user--it will say already exists, but then after that they can sign up again (but don't use this code--modify the collection instead)
					//if (result.username=="attendance") {
					//    console.log("DELETING attendance");
					//    collection.remove();
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
//function by eyelidlessness on <https://stackoverflow.com/questions/1181575/determine-whether-an-array-contains-a-value> 5 Jan 2016. 31 Aug 2017. 
//var contains = function(needle) {
exports.contains = function(needle) {
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
//var result = fun.contains.call(myArray, needle); // true

///returns: whether the haystack only contains characters from needle_chars_as_string
///(false if haystack has any other characters)
exports.only_contains_any_char = function(haystack, needle_chars_as_string) {
	var result = true;
	for (i = 0; i < haystack.length; i++) {
		//if criteria does not contain haystack (yes, this is correct), return false
		if (!exports.contains.call(needle_chars_as_string, haystack.substring(i,i+1))) {
			result = false;
			break;
		}
	}
	return result;
}


exports.is_not_blank = function (str) {
	return str && str.trim();
}

exports.is_blank = function (str) {
	return (str===undefined) || (str===null) || (!str) || (!str.trim());
}

exports.to_ecmascript_value = function (val) {
	var result = "\"<error reading variable>\"";
	if (val===null) result="null";
	else if (val===undefined) result="null";
	else if ((typeof val)=="string") result="\""+val+"\"";
	else result = JSON.stringify(val);
	return result;
}


	
//Array.prototype.contains = function(obj) {
//    var i = this.length;
//    while (i--) {
//        if (this[i] == obj) {
//            return true;
//        }
//    }
//    return false;
//}
//doesn't work:
//Array.prototype.indexOf = function(obj) {
//    var i = this.length;
//    while (i--) {
//        if (this[i] == obj) {
//            return i;
//        }
//    }
//    return -1;
//}
