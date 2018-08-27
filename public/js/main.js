function getPasswordForm(username) {
	var ret = "";
	if (username) {
		ret += '<form class="form-inline" action="changeUserPassword" method="POST">\n';
		ret += '<input type="hidden" name="username" id="username" value="'+username+'"/>';
		ret += '<input type="password" class="form-control" id="password" placeholder="(new password)"/>';
		ret += '<input type="password" class="form-control" id="password_repeat" placeholder="(repeat password)"/>';
		ret += '<button type="submit" class="btn"><span class="glyphicon glyphicon-ok" style="color:gray"></button>';
		ret += '</form>\n';
	}
	else {
		console.log("ERROR in getPasswordForm: username", username);
	}
	return ret;
}

function writeUsersTable(create_enable) {

	var player_color_s = "gray";
	var el_id = "users_editor";  // must also be redefined locally in onload handler
	var target_el = document.getElementById(el_id);
	if (target_el) {
		target_el.innerHTML = "...";
		var request = new XMLHttpRequest();
		request.open('GET', '/listUsers', true);
		request.onload = function() {
			//see http://youmightnotneedjquery.com/
			var ret="";
			if (request.status >= 200 && request.status < 400) {
				//"AJAJ" is harder to say than AJAX, but use json as the data format:
				var results = JSON.parse(request.responseText);
				if (results.message) {
					ret = results.message; // Error object
				}
				else {
					var row_template = ["<widgets>","username","password","name","givenName","familyName","GradYr"];
					var display_strings = {
						"name": "Nickname",
						"givenName": "First",
						"familyName": "Last"
					}
					ret += '<TABLE class="table table-sm">\n';
					ret += '<THEAD><TR>\n';
					for (var v_i=0; v_i<row_template.length; v_i++) {

						ret += '<TH>';
						var heading = row_template[v_i];
						if (display_strings.hasOwnProperty(heading)) ret += display_strings[heading];
						else ret += heading;
						ret += '</TH>\n';
					}
					ret += '</TR></THEAD>\n';
					ret += '<TBODY>\n';
					for (var r_i=0; r_i<results.length; r_i++) {
						var user = results[r_i];
						var good_count = 0;
						for (var v_i=0; v_i<row_template.length; v_i++) {
							var key = row_template[v_i];
							if (key != "<widgets>") {
								if (user.hasOwnProperty(key)) good_count++;
							}
							//else console.log("missing key " + key);
						}
						//console.log("good_count: " + good_count);
						ret += '<TR>\n';
						if (good_count > 0) {
							for (var v_i=0; v_i<row_template.length; v_i++) {
								var key = row_template[v_i];
								ret += '<TD>';
								if (key == "password") {
									ret += getPasswordForm(user.username);
								}
								else if (key == "<widgets>") {
									ret += '<form class="form-inline" action="deleteUser" method="POST">\n';
									ret += '<input type="hidden" name="username" id="username" value="'+user.username+'"/>';
									ret += '<button type="submit" class="btn">';
									ret += '<span class="glyphicon glyphicon-remove" style="color:black"></span>';
									ret += '</button>';
									ret += '\n';
									ret += '</form>\n';
								}
								else if (user.hasOwnProperty(key)) {
									ret += '<form class="form-inline" action="changeUserField" method="POST">\n';
									// ret += '<label class="sr-only" for="inlineFormInputName2">'+key+'</label>';
									ret += '<div class="input-group mb-3">\n';
									ret += '  <input type="hidden" id="key" value="'+key+'">\n';
									ret += '  <input type="text" class="form-control" name="'+key+'" id="' + key + '" aria-label="'+key+'" value="'+user[key]+'">\n'; //placeholder="" aria-label="" aria-describedby="basic-addon2"
									ret += '  <div class="input-group-append">\n';
									ret += '    <button type="submit" class="btn btn-outline-secondary"><span class="glyphicon glyphicon-ok" style="color:gray"></span></button>\n';
									ret += '  </div>\n';
									ret += '</div>\n';
									//ret += '<input type="text" class="form-control" id="' + key + '" value="'+user[key]+'">';
									//ret += user[key];
									//ret += '<button type="submit" class="btn">';
									//ret += '<span class="glyphicon glyphicon-ok" style="color:gray"></span>';
									//other glyphs:
									//glyphicon glyphicon-hourglass
									//glyphicon glyphicon-send (paper airplane)
									//glyphicon glyphicon-stats (random bars)
									//ret += '</button>';
									ret += '</form>';
								}
								else {
									ret += '<form class="form-inline" action="changeUserField" method="POST">\n';
									ret += '<div class="input-group mb-3">\n';
									ret += '  <input type="hidden" id="key" value="'+key+'">\n';
									ret += '  <input type="text" class="form-control" name="'+key+'" id="' + key + '" aria-label="'+key+'" value="">\n'; //placeholder="" aria-label="" aria-describedby="basic-addon2"
									ret += '  <div class="input-group-append">\n';
									ret += '    <button type="submit" class="btn btn-outline-secondary"><span class="glyphicon glyphicon-ok" style="color:gray"></span></button>\n';
									ret += '  </div>\n';
									ret += '</div>\n';
									ret += '</form>';
								}
								ret += '</TD>';
							}
						}
						else {
							if (user.hasOwnProperty("info") && user.info=="EOF") {
								ret += "<!--EOF-->";
							}
							else {
								ret += '<TD colspan="'+row_template.length+'">';
								ret += JSON.stringify(user);
								ret += '</TD>';
							}
						}
						ret += '</TR>\n';
					}  // end for users
					ret += '</TBODY>\n';
					ret += '</TABLE>\n';
					ret += '<form class="form" action="createUser" method="POST">\n';
					var table_enable = true;
					if (table_enable) {
						ret += '<TABLE class="table">\n'; // table-striped
						ret += '<THEAD><TR>\n';
						for (var v_i=0; v_i<row_template.length; v_i++) {

							ret += '<TH>';
							var heading = row_template[v_i];
							if (display_strings.hasOwnProperty(heading)) ret += display_strings[heading];
							else ret += heading;
							ret += '</TH>\n';
						}
						ret += '</TR></THEAD>\n';
						ret += '<TR>\n';
					}
					for (var v_i=0; v_i<row_template.length; v_i++) {
						var key = row_template[v_i];
						if (table_enable) ret += '<TD>';
						if (key == "password") {
							ret += '<input type="password" class="form-control" name="password" id="password" placeholder="(new password)">';
							ret += '<input type="password" class="form-control" name="password_repeat" id="password_repeat" placeholder="(repeat password)">';
						}
						else if (key == "<widgets>") {
							if (table_enable) ret += '<button type="submit" class="btn"><span class="glyphicon glyphicon-plus" style="color:gray"></span></button>'; //  btn-primary mb-2
						}
						else {
							ret += '<input type="text" class="form-control" name="' + key + '" id="' + key + '"/>\n';
						}
						if (table_enable) ret += '</TD>';
					}
					if (table_enable) ret += '</TR>\n';
					if (table_enable) ret += '</TABLE>\n';
					//ret += '<div align="right" style="text-align:right">';
					if (!table_enable) ret += '<button type="submit" class="btn"><span class="glyphicon glyphicon-plus" style="color:gray"></span></button>'; //  btn-primary mb-2
					//ret += '</div>\n';
					ret += '</form>\n';
				}
			}
			else {
				ret="url error " + request.status;
			}
			var el_id = "users_editor";  // must also be redefined locally in onload handler
			var target_el = document.getElementById(el_id);
			target_el.innerHTML = ret;
		}

		request.onerror = function() {
			var el_id = "users_editor";  // must also be redefined locally in onload handler
			var target_el = document.getElementById(el_id);
			target_el.innerHTML = "connection error";
		};
		request.send();
	}
	else {
		//console.log("(verbose message in writeUsersTable) skipping " + el_id + " since not on this page");
	}
}

writeUsersTable(true);
