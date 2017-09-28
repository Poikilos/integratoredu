This code is deprecated (user_selectable_modes instead which excludes transient modes and modes available for user if were in another section)
```xml
			{{#each modes_by_section}}
				{{#if_eq @key @root.section}}
					<table>
					<tr>
					{{#each this}}
					<td>
					<form action="{{get_proxy_prefix_then_slash}}">
					<input type="hidden" name="section" id="section" value="{{@root.section}}"/>
					<input type="hidden" name="mode" id="mode" value="{{this}}" />
					{{#if_eq this @root.mode}}
					<input class="btn" type="submit" value="{{friendlyModeName this}}" />
					{{else}}
					<input class="btn btn-default" type="submit" value="{{friendlyModeName this}}" />
					{{/if_eq}}
					</form>
					</td>
					{{/each}}
					</tr>
					</table>
				{{/if_eq}}
			{{/each}}
```

This code is deprecated (use link instead):
```xml
			{{!--
			<form action="{{get_proxy_prefix_then_slash}}">
			<input type="hidden" name="section" id="section" value="{{this}}"/>
			{{#if_eq this @root.section}}
				<input class="btn btn-link disabled" type="submit" value="{{friendlySectionName this}}" />
			{{else}}
				<input class="btn btn-link" type="submit" value="{{friendlySectionName this}}" />
			{{/if_eq}}
			</form>--}}
```

This code is deprecated (instead, use compact link area in heading for choices and invisible table for content):
```xml
	<div class="panel panel-default">
		<div class="panel-heading">
			<div class="panel-title pull-right">
				<table>
				<tr>
			{{#each user_selectable_modes}}
				<td>
				<form action="{{get_proxy_prefix_then_slash}}">
				<input type="hidden" name="section" id="section" value="{{@root.section}}"/>
				<input type="hidden" name="mode" id="mode" value="{{this}}" />
				{{#if_eq this @root.mode}}
				<input class="btn" type="submit" value="{{friendlyModeName this}}" />
				{{else}}
				<input class="btn btn-default" type="submit" value="{{friendlyModeName this}}" />
				{{/if_eq}}
				</form>
				</td>
			{{/each}}
				</tr>
				</table>
			
			</div>
			<div class="clearfix"></div> {{!--fills out height of the title row, so float doesn't cause text to hang out the bottom--}}
		</div>
		<div class="panel-body">
		</div>
	</div>
```	
