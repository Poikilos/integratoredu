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
				if (result !== null) {
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
					};

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
			console.log("localReg CANNOT CONNECT TO DATABASE: " + user.error);
			deferred.resolve(user);
		}
        });
    }
    else {
        console.log("localReg: MISSING PASSWORD");
        deferred.resolve(false);
    }
  }
  else {
    console.log("localReg: MISSING USERNAME");
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
        if (null === result) {
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
};







////// GENERAL FUNCTIONS ///////



//from Titlacauan on https://stackoverflow.com/questions/18112204/get-all-directories-within-directory-nodejs
exports.getDirectories = function(path) {
	return fs.readdirSync(path).filter(function (file) {
		return fs.statSync(path+'/'+file).isDirectory();
	});
};

exports.getFiles = function(path) {
	return fs.readdirSync(path).filter(function (file) {
		return !fs.statSync(path+'/'+file).isDirectory();
	});
};
//versions below ignore if starting with "."
exports.getVisibleDirectories = function(path) {
	return fs.readdirSync(path).filter(function (file) {
		return fs.statSync(path+'/'+file).isDirectory() && (file.substring(0,1)!=".");
	});
};

exports.getVisibleFiles = function(path) {
	return fs.readdirSync(path).filter(function (file) {
		return !fs.statSync(path+'/'+file).isDirectory() && (file.substring(0,1)!=".");
	});
};

exports.contains = function(haystack, needle) {
	return haystack.indexOf(needle) > -1;
};

exports.get_row = function(obj, names) {
	var result = [];
	var n_i;
	var n_len=names.length;
	for (n_i=0; n_i<n_len; n_i++) {
		if (names[n_i] in obj) result.push(obj[names[n_i]]);
		else result.push("");
	}
	return result;
};

exports.array_index_of = function(haystack, needle) {
	if (haystack && Array.isArray(haystack)) {
		var findNaN = needle !== needle;
		for (var i=0,len=haystack.length; i<len; i++) {
			var item = haystack[i];
			if ((findNaN && (item !== item)) || item === needle) {
				return i;
			}
		}
	}
	return -1;
};

exports.array_contains = function(haystack, needle) {
	//NOTE: do NOT use haystack.includes(needle), since that is hidden behind harmony flags in node.js for backward compatibility
	// Per spec, the way to identify NaN is that it is not equal to itself
	var findNaN = needle !== needle;
	for (var i=0,len=haystack.length; i<len; i++) {
		var item = haystack[i];
		if ((findNaN && (item !== item)) || item === needle) {
			return true;
		}
	}
	return false;
};

//case-insensitive version
exports.array_contains_ci = function(haystack, needle) {
	//NOTE: do NOT use haystack.includes(needle), since that is hidden behind harmony flags in node.js for backward compatibility
	// Per spec, the way to identify NaN is that it is not equal to itself
	var findNaN = needle !== needle;
	var needle_lower = needle;
	if ((typeof needle_lower)=="string") needle_lower = needle_lower.toLowerCase();
	for (var i=0,len=haystack.length; i<len; i++) {
		var item = haystack[i];
		if ((findNaN && (item !== item)) ||
			(((typeof item)=="string") && item.toLowerCase() === needle_lower) ||
			(((typeof item)!="string") && item === needle)
		) {
			return true;
		}
	}
	return false;
};

exports.zero_padded = function(str, len) {
	var result = str;
	if (typeof(str)!="string") result = ""+str;
	while (result.length<len) result = "0"+result;
	return result;
};

//Like in python, "Return the base name of pathname path. This is the second element of the pair returned by passing path to the function split(). Note that the result of this function is different from the Unix basename program; where basename for '/foo/bar/' returns 'bar', the basename() function returns an empty string ('')."
exports.basename = function(path) {
	var result = path;
	if (exports.is_not_blank(path)) {
		last_slash_i = path.lastIndexOf("/");
		if (last_slash_i>-1) {
			result = path.substring(last_slash_i+1);
		}
		//else result is param given (as initialized)
	}
	return result;
};

exports.split_capitalized = function(delimited, delimiter) {
	var results = delimited.split(delimiter);
	for (var ds_i=0,ds_len=results.length; ds_i<ds_len; ds_i++) {
		results[ds_i] = results[ds_i].charAt(0).toUpperCase() + results[ds_i].slice(1);
	}
	return results;
};

//Like in python, "Split the pathname path into a pair (root, ext) such that root + ext == path, and ext is empty or begins with a period and contains at most one period. Leading periods on the basename are ignored; splitext('.cshrc') returns ('.cshrc', '')."
exports.splitext = function(path) {
	var chunks = ["",""];
	if (path) {
		var last_dot_i = path.lastIndexOf('.');
		var last_slash_i = path.lastIndexOf('/');
		if (last_dot_i>-1) {
			if (last_slash_i<=-1 || last_dot_i>last_slash_i) {
				if ((last_slash_i<=-1&&last_dot_i!==0)||(last_slash_i>-1&&last_dot_i!==last_slash_i+1)) {
					chunks[0] = path.substring(0,last_dot_i);
					chunks[1] = path.substring(last_dot_i+1);
				}
				else chunks[0] = path; //no extension, path must have been something like .cshrc OR /home/owner/.cshrc (a name that starts with a dot is not counted as having an extension)
			}
			else chunks[0] = path; //no extension, since there is a slash and dot is before slash
		}
		else chunks[0] = path; //no extension, since no dot
	}
	return chunks;
};


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
};



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
};

exports.good_time_string = function(human_written_time_string) {
	var result = null;
	if (human_written_time_string) {
		var input_lower = human_written_time_string.toLowerCase().trim();
		var am_i = input_lower.indexOf("am");
		var hour_adder = 0;
		var hour = null;
		var minute = null;
		var second = 0;
		if (am_i>-1) {
			input_lower = input_lower.substring(0, am_i).trim();
		}
		else {
			var pm_i = input_lower.indexOf("pm");
			if (pm_i>-1) {
				hour_adder = 12;
				input_lower = input_lower.substring(0, pm_i).trim();
			}
		}
		var colon_i = input_lower.indexOf(":");
		if (colon_i>-1) {
			hour = parseInt(input_lower.substring(0,colon_i));
			var chunk2 = input_lower.substring(colon_i+1);
			var colon2_i = chunk2.indexOf(":");
			if (colon2_i>-1) {
				second = parseInt(chunk2.substring(colon2_i+1));
				chunk2 = chunk2.substring(0,colon2_i);
			}
			minute = parseInt(chunk2);
		}
		else {
			var n = parseInt(input_lower);
			if (n>23) {
				if (input_lower.length==3) {
					//such as: read 640 as 6:40)
					hour = parseInt(input_lower.substring(0,1));
					minute = parseInt(input_lower.substring(1));
				}
				else if (input_lower.length==4) {
					hour = parseInt(input_lower.substring(0,2));
					minute = parseInt(input_lower.substring(2));
				}
			}
			else {  //if (input_lower.length==1 || input_lower.length==2) {
				hour = n;
				minute = 0;
			}
		}
		if (hour !== null) {
			hour += hour_adder;
			var h_str = hour.toString();
			if (h_str.length<2) h_str = "0" + h_str;
			var m_str = minute.toString();
			if (m_str.length<2) m_str = "0" + m_str;
			var s_str = second.toString();
			if (s_str.length<2) s_str = "0" + s_str;
			result = h_str+":"+m_str+":"+s_str; //assume 0 seconds
		}
	}
	return result;
};

exports.get_date_or_stated_date = function(record) {
	var stated_date_enable = false;
	var stated_date = null;
	var result = null;
	if (("stated_date" in record) && exports.is_not_blank(record.stated_date)) {
		stated_date = record.stated_date;
		if (stated_date!==null) {
			if (stated_date.length==10) {
				if ( stated_date.substring(2,3)=="/" &&
						stated_date.substring(5,6)=="/" &&
						exports.only_contains_any_char(stated_date.substring(0,2), "0123456789") &&
						exports.only_contains_any_char(stated_date.substring(3,5), "0123456789") &&
						exports.only_contains_any_char(stated_date.substring(6), "0123456789")
					) {
					//convert MM/DD/YYYY to YYYY-MM-DD:
					var original_stated_date = stated_date;
					stated_date = stated_date.substring(6) + "-" + stated_date.substring(0,2) + "-" + stated_date.substring(3,5);
					stated_date_enable = true;
					console.log("  * NOTE: converted date " + original_stated_date + " to " + stated_date);
				}
				else if ( stated_date.substring(4,5)=="-" &&
							stated_date.substring(7,8)=="-" &&
							exports.only_contains_any_char(stated_date.substring(0,4), "0123456789") &&
							exports.only_contains_any_char(stated_date.substring(5,7), "0123456789") &&
							exports.only_contains_any_char(stated_date.substring(8), "0123456789")
					) {
					stated_date_enable = true;
					console.log("  * NOTE: using stated_date " + stated_date);
				}
				else console.log("  * WARNING: skipped bad stated_date "+stated_date+" in get_date_or_stated_date");
			}
		}
	}
	if (stated_date_enable) result = stated_date;
	else {
		if ("ctime" in record) {
			if ( (record.ctime.substring(4,5)=="-") &&
				 (record.ctime.substring(7,8)=="-") ) {
				result = record.ctime.substring(0,10);
			}
			else console.log("  * WARNING: skipped custom ctime "+record.ctime+" in get_date_or_stated_date");
		}
	}
	return result;
};

exports.safe_equals_ci = function(par1, par2) {
	if ((par1!==null)&&(par2!==null)&&(par1!==undefined)&&(par2!==undefined)&&(par1===par1)&&(par2===par2)) { ///=== to ensure is not NaN
		if ((typeof par1)!="string") par1 = ""+par1;
		if ((typeof par2)!="string") par2 = ""+par2;
		par1=par1.trim().toLowerCase();
		par2=par2.trim().toLowerCase();
		return par1==par2;
	}
	return false;
};

exports.single_level_copy = function(src) {
	result = {};
	for (var index in src) {
		if ( ((typeof src[index])!=="undefined") ){
			if ((typeof src[index]) == "object") {
				if (src[index]===null) result[index]=null;
				else result[index] = JSON.parse(JSON.stringify(src[index]));
			}
			else if ((typeof src[index]) == "boolean") result[index] = src[index];
			else if ((typeof src[index]) == "number") result[index] = src[index];
			else if ((typeof src[index]) == "string") result[index] = src[index];
			else if ((typeof src[index]) == "boolean") result[index] = src[index];
			else if ((typeof src[index]) == "symbol") result[index] = src[index];
			else if ((typeof src[index]) == "function") result[index] = src[index];
		}
	}
	return result;
};

exports.get_time_or_stated_time = function(record) {
	var result = null;
	if ("stated_time" in record) {
		var good_time = exports.good_time_string(record.stated_time);
		if (good_time !== null) {
			result = good_time;
			//var good_date = exports.get_date_or_stated_date(record);
			//if (good_date !== null) {
			//	result = good_date + " " + good_time;
			//}
			//else {
			//	result = moment().format("YYYY-MM-DD") + " " + good_time;
			//}
		}
		else console.log("WARNING: ignored bad stated_time "+record.stated_time+" in "+get_time_or_stated_time);
	}
	var NaN_warning_enable = true;
	if ((result===null) || (result.indexOf("NaN")>-1)) {
		if ((result!==null) && (result.indexOf("NaN")>-1)) {
			var key_msg="";
			if ("key" in record) key_msg += " key:"+record.key;
			if ("first_name" in record) key_msg += " first_name:"+record.key;
			if ("last_name" in record) key_msg += " last_name:"+record.key;
			if ("stated_date" in record) key_msg += " stated_date:"+record.key;
			else if ("ctime" in record) key_msg += " date():"+record.ctime.substring(0,10);
			if (key_msg.length===0) key_msg = JSON.stringify(record);
			console.log("WARNING: got NaN in get_time_or_stated_time for stated_time in record "+key_msg);
			NaN_warning_enable = false;
		}
		if ("time" in record) {
			result = record.time;
			if (result.indexOf("NaN")>-1) console.log("WARNING: got NaN in get_time_or_stated_time for time in record "+JSON.stringify(record));
		}
	}
	//if (result !== null) {
	//	if (result.indexOf("NaN")>-1) console.log("WARNING: got NaN in get_time_or_stated_time for record "+JSON.stringify(record));
	//}
	return result;
};

exports.get_datetime_or_stated_datetime = function(record) {
	var good_date = exports.get_date_or_stated_date(record);
	var good_time = exports.get_time_or_stated_time(record);
	var result = null;
	if (good_time!==null && good_date!==null) result = good_date + " " + good_time;
	else if ("ctime" in record) result = record.ctime;
	else if ("mtime" in record) result = record.ctime;
	return result;
}


exports.is_blank = function (str) {
	//if trimmed to a blank string, then is blank
	//not equal to self implies value is NaN in str!==str below--NaN is considered not blank.
	//regarding non-string tests below, see similar topic: https://stackoverflow.com/questions/19839952/all-falsey-values-in-javascript
	//                                                                                                to check for NaN, MUST DO (str!==str)
	return (   ( (typeof(str)=="string") && str.trim()==="" )   ||   (  (!str) && (str!==false) && (str!==0) && (str!==-0) && (!(str!==str))  )   );
	//return str===null  ||  str.trim  &&  (  || (str.trim()==="") ); //|| (str===undefined) || (str===null) || (str==="") 
	//if (typeof(str)=="string") console.log("[ verbose message ] is string:");
	//else console.log("[ verbose message ] is not string:");
	//if (result) console.log("  [ verbose message ] is blank: "+str);
	//else console.log("  [ verbose message ] is not blank: "+str);
	//return result;
};

exports.is_true = function (str) {
	var str_lower = null;
	if ((typeof str)=="string") str_lower=str.toLowerCase();
	return (str===true) || ((str_lower!==null) && (str_lower=="true"||str_lower=="yes"||str_lower=="1"||str_lower=="on"));
};

exports.is_not_blank = function (str) {
	//return str && str.trim();
    return !exports.is_blank(str);
};

exports.to_ecmascript_value = function (val) {
	var result = "\"<error reading variable>\"";
	if (val===null) result="null";
	else if (val===undefined) result="null";
	else if ((typeof val)=="string") result="\""+val+"\"";
	else result = JSON.stringify(val);
	return result;
};
