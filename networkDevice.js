/*
	Fing Output example:
		2013/12/12 18:14:32;up;10.66.0.11;;camera2.home.mikelamoureux.net;F0:7D:68:09:B7:6B;D-Link

	Fing Array:
		[0]: Date
		[1]: State (up, down, changed)
		[2]: IP Address
		[3]: Unknown
		[4]: DNS Domain
		[5]: Mac Address
		[6]: Manufacturer
		[7]: Common Known Name

	[NetworkDevices]:
		[0] = Mac Address
		[1] = State
		[2] = IP Address
		[3] = White Listed (true or false)
		[4] = Alert Device (true or false)
		[5] = Manufacturer
		[6] = Fing Timestamp
		[7] = Timeout expiration for declaring "off" network
		[8] = Previously Reported (for non-whitelisted devices)
		[9] = Fully qualified domain name
		[10] = Indigo State
*/

function NetworkDevice(mac, ip, fqdn, manufacturer) {

	getCurrentTime = function () {
			return (_moment().format(_dateformat));
		}

	var self = this,
		_moment = require('moment'),
		_spawn = require('child_process').spawn,
		exec = require('child_process').exec,
		_schedule = require('node-schedule'),
		alertExpirationJob,
		_alertExpirationDate,
		IndigoConfiguration = require("./indigoConfiguration.js"),
		_csv = require('csv'),
		_indigoConfiguration,
		_dateformat = "YYYY/MM/DD HH:mm:ss",
		_needle = require('needle'),
		_mac = mac || 'none',
		_state,
		_ip = ip || 'none',
		_manufacturer,
		_fingTimestamp = getCurrentTime(),
		_fqdn = fqdn || 'none',
		_alertEmailList;

		this.getMACAddress = function () {
			return _mac;
		}

		this.getIPAddress = function () {
			return _ip;
		}

		this.getManufacturer = function () {
			return _manufacturer;
		}

		this.getFQDN = function () {
			return _fqdn;
		}

		this.getDeviceState = function () {

			if (typeof _state === 'undefined') return undefined;
			if (typeof(_state) == "boolean") return (_state);

			switch (_state.toUpperCase())
			{
				case "UP":
					return (true);
				case "TRUE":
					return (true);
				case "DOWN":
					return (false);
				case "FALSE":
					return (false);
			}

			return false;
		}

		this.setFingTimestamp = function () {
			_fingTimestamp = getCurrentTime();
		}

		this.setMAC = function (mac) {
			_mac = mac;
		}

		this.setIPAddress = function(ip) {
			_ip = ip;
		}

		this.setDeviceState = function (state) {
			console.log("** (" + getCurrentTime() + ") Device state for " + this.getMACAddress() + " is being set to " + state);

			// Alert Device Stuff
			// if the device is off and the previous state was on and it's an alert device, update the alert expiration
			if (!state && state != _state && this.isAlertDevice())
			{
				this.setAlertExpriation();
			}
			// if the device is on and it's an alert device
			else (state && this.isAlertDevice())
			{
				// if there was a job scheduled to send that the device is off, cancel the job
				if  (typeof alertExpirationJob !== 'undefined')
				{
					alertExpirationJob.cancel();
					alertExpirationJob = undefined;
				}
			}

			_state = state;

			// White List Device Stuff
			if (this.isReadyforWhiteListAlert())
			{
				this.reportUnknownDevice(_alertEmailList);
			}

			if (this.isReadyforAlert())
			{
				this.alertDevice();
			}
		}

		this.isReadyforWhiteListAlert = function () {
			return (this.getDeviceState() && !this.isWhiteListedDevice() && !_unknownDeviceReported);	
		}

		this.setFQDN = function (fqdn) {
			_fqdn = fqdn;
		}

		this.setManufacturer = function (manufacturer) {
			_manufacturer = manufacturer;
		}

		this.setAlertEmailList = function (alertEmailList)
		{
			_alertEmailList = alertEmailList;
		}

		this.setIndigoConfiguration = function (indigoConfiguration) {
			console.log("** (" + getCurrentTime() + ") Indigo configuration for " + this.getMACAddress() + " is being set");

			_indigoConfiguration = indigoConfiguration;
			this.scheduleIndigoVariableRefresh();
		}

// **************************************************************************
// White List Functions

	var _whiteListed = false,
		_unknownDeviceReported = false,
		_whiteListDeviceName;

		this.setWhiteListDevice = function (whiteListDeviceName) {
			_whiteListed = true;
			_whiteListDeviceName = whiteListDeviceName;
			console.log("** (" + getCurrentTime() + ") Whitelisted device has been marked for " + _whiteListDeviceName);
		}

		this.clearWhiteListDevice = function () {
			_whiteListed = false;
			_whiteListDeviceName = undefined;
			_unknownDeviceReported = false;

			// this function gets called when configuration is being reset.  If the whitelist status is changed, we need to report the device if it is no loger cleared.
			// This block of code is going to schedule a check to see if the device needs to be reported in 2 minutes.

			// Add two minutes to the current time.
			_recheckWhiteListStatus = _moment().add('m', 2).format(_dateformat);

			_recheckWhiteListStatusDate = new Date(
				_moment(_recheckWhiteListStatus, _dateformat).year(), 
				_moment(_recheckWhiteListStatus, _dateformat).month(), 
				_moment(_recheckWhiteListStatus, _dateformat).date(), 
				_moment(_recheckWhiteListStatus, _dateformat).hour(), 
				_moment(_recheckWhiteListStatus, _dateformat).minute(), 
				_moment(_recheckWhiteListStatus, _dateformat).seconds()
			);

			var job = _schedule.scheduleJob(_recheckWhiteListStatusDate, function() {
				console.log("** (" + getCurrentTime() + ") Checking whitelist status for " + self.getMACAddress());

				// White List Device Stuff
				if (self.isReadyforWhiteListAlert())
				{
					self.reportUnknownDevice(_alertEmailList);
				}
			});

		}

		this.isWhiteListedDevice = function () {
			return _whiteListed;
		}


	this.reportUnknownDevice = function(emails) {
		// if it was already reported, let's quit
		if (_unknownDeviceReported) return;

		var alertText = "ALERT ** Found a device that is not cleared to be on the network: " + _mac + " FQDN: " + _fqdn;


		console.log("** (" + getCurrentTime() + ") " + alertText);
		for (var i=0; i < emails.length; i++)
		{
		    exec("echo \"" + alertText + "\" | mail -s \"Network Device Alert\" " + emails[i], function(error, stdout, stderr)
		    	{
		    		console.log(stdout); 
		    	});
		}

		_unknownDeviceReported = true;
	}


// **************************************************************************
// Alert Functions

	var _alertDevice = false,
		_lastAlertSent,
		_alertDeviceName,
		_alertMode,
		_alertIndigoVariableURL,
		_alertOffNetworkTTL,
		_alertExpiration,
		_indigoState,
		_indigoStateTimestamp,
		_scheduledRefresh = false,
		_indigoRefreshIntervalID;

	this.clearAlertDevice = function () {
		_alertDevice = false;
		_alertDeviceName = undefined;
		_alertMode = undefined;
		_alertIndigoVariableURL = undefined;
		_alertOffNetworkTTL = undefined;

		if (typeof alertExpirationJob !== 'undefined')
		{
			alertExpirationJob.cancel();
			alertExpirationJob = undefined;
		}		
	}

	this.setAlertDevice = function (alertDeviceName, alertMode, alertModeVariable, alertOffNetworkTTL) {
		_alertDevice = alertMode.length > 0;

		this.setWhiteListDevice(alertDeviceName);

		_alertDeviceName = alertDeviceName;
		_alertMode = alertMode;
		_alertIndigoVariableURL = alertModeVariable;
		_alertOffNetworkTTL = alertOffNetworkTTL;

		console.log("** (" + getCurrentTime() + ") Alert Device has been enabled for " + _alertDeviceName);

		this.refreshIndigoState();

		this.scheduleIndigoVariableRefresh();
	}

	this.setAlertExpriation = function () {
		_alertExpiration = _moment().add('m', _alertOffNetworkTTL).format(_dateformat);

		_alertExpirationDate = new Date(
			_moment(_alertExpiration, _dateformat).year(), 
			_moment(_alertExpiration, _dateformat).month(), 
			_moment(_alertExpiration, _dateformat).date(), 
			_moment(_alertExpiration, _dateformat).hour(), 
			_moment(_alertExpiration, _dateformat).minute(), 
			_moment(_alertExpiration, _dateformat).seconds()
		);

/*
		console.log(_moment(_alertExpiration, _dateformat).year());
		console.log(_moment(_alertExpiration, _dateformat).month());
		console.log(_moment(_alertExpiration, _dateformat).date());
		console.log(_moment(_alertExpiration, _dateformat).hour());
		console.log(_moment(_alertExpiration, _dateformat).minute());
		console.log(_moment(_alertExpiration, _dateformat).seconds());
*/
		var job = _schedule.scheduleJob(_alertExpirationDate, function() {
			console.log("** (" + getCurrentTime() + ") Running the scheduled job to alert for device" + _alertDeviceName);

			if (self.isReadyforAlert())
			{
				self.alertDevice();
			}
		});

		console.log("** (" + getCurrentTime() + ") New expiration and scheduled job for " + _alertDeviceName + ": " + _alertExpiration + " (" + alertExpirationJob + ")");
	}

	this.getAlertExpiration = function () {
		return _alertExpiration;
	}

	this.isAlertDevice = function () {
		return _alertDevice;
	}

	this.getIndigoState = function () {
		return _indigoState;
	}


// **************************************************************************
// Public Functions

	this.logToConsole = function() {
		console.log("\t***************** -- Device Details " + getCurrentTime() + " -- **************");
		console.log("\t\tTimestamp: " + _fingTimestamp);
		console.log("\t\tMac: " + this.getMACAddress());
		console.log("\t\tIP Address: " + this.getIPAddress());
		console.log("\t\tFQDN: " + this.getFQDN());
		console.log("\t\tState: " + this.getDeviceState());
		console.log("\t\tIndigo Configuration: " + _indigoConfiguration);

		console.log("\t\tis a Whitelisted device?: " + this.isWhiteListedDevice());
		console.log("\t\thas been reported?: " + _unknownDeviceReported);
		console.log("\t\tis a Alert Device?: " + this.isAlertDevice());

		if (this.isAlertDevice()) console.log("\t\tAlert Device Name: " + _alertDeviceName);
		if (this.isAlertDevice()) console.log("\t\tScheduled refresh: " + _scheduledRefresh);
		if (this.isWhiteListedDevice()) console.log("\t\tWhite List Device Name: " + _whiteListDeviceName);

		console.log("\t\tFing last update timestamp: " + _fingTimestamp);
		console.log("\t\t\"Off network\" Expiration Time: " + _alertExpiration);
		if (this.isAlertDevice()) console.log("\t\tCached Indigo Value: " + this.getIndigoState());
		if (this.isAlertDevice()) console.log("\t\tIndigo Value Timestamp: " + _indigoStateTimestamp);		
		console.log("\t******************************************************");		
	}

// **************************************************************************
// Private Functions

	this.scheduleIndigoVariableRefresh = function () {
		if (typeof _indigoRefreshIntervalID !== 'undefined')
		{
			clearInterval(_indigoRefreshIntervalID);
		}

		if (this.isAlertDevice() && !_scheduledRefresh) {
			if (typeof _indigoConfiguration != 'undefined') {
				console.log("** (" + getCurrentTime() + ") About to schedule a refresh for the Indigo variable of " + _alertDeviceName + ".");
				_scheduledRefresh = true;
				_indigoRefreshIntervalID = setInterval(function() {
					self.refreshIndigoState();
		        }, _indigoConfiguration.getIndigoVariableRefreshRate());			
			}
		}
	}

	this.isReadyforAlert = function () {
		// if it's not a device that needs to be announced (alert flag is false)	
		if (!this.isAlertDevice()) {
			return false;
		}

		if (typeof this.getIndigoState() === 'undefined') {
			this.setIndigoState();

			// since we don't know the indigo state, we will let that update asyncronously, but since that will not finish immediately, update if the status is true
			return this.getDeviceState();
		}

		console.log("** (" + getCurrentTime() + ") Cached Indigo value of " + _alertDeviceName + " is: " + this.getIndigoState() + ", current state from fing is " + this.getDeviceState());

		if (!this.getIndigoState() && this.getDeviceState())
		{
			console.log("** (" + getCurrentTime() + ") Will send an alert for device " + _alertDeviceName + " since Indigo state is false and the device is online");

			return true;
		}
		else if (this.getDeviceState() == this.getIndigoState())
		{
			console.log("** (" + getCurrentTime() + ") Not going to send an alert for device " + _alertDeviceName + " because Indigo is already set appropriately");
			return false;
		}
		else if (!this.getDeviceState() && (getCurrentTime() < this.getAlertExpiration())) {
			console.log("** (" + getCurrentTime() + ") Not going to send an alert for device " + _alertDeviceName + " because the expiration time has not passed (" + _alertExpiration + ")");
			
			// NEED TO SCHEDULE A Alert HERE...

			return false;
		}

		console.log("** (" + getCurrentTime() + ") Will send an alert for device " + _alertDeviceName);
		return true;		
	}

	this.refreshIndigoState = function() {
		var newIndigoValue = false;

		_needle.get(_alertIndigoVariableURL + ".txt", function(err, resp, body) {
			_csv()
			.from(body, { delimiter: ':', ltrim: 'true', rtrim: 'true' })
			.to.array( function(data, count) {
				console.log("** (" + getCurrentTime() + ") Raw HTTP request results from Indigo: \n" + body);
				newIndigoValue = data[5][1] == "true";
				
				console.log("** (" + getCurrentTime() + ") Obtained and saved the current value of indigo variable " + _alertDeviceName + " is: " + newIndigoValue);
				
				_indigoState = newIndigoValue;
				_indigoStateTimestamp = getCurrentTime();
			});
		});		
	}

	this.alertDevice = function() {
		if (!this.isAlertDevice()) return;

		var setValue;

		if (this.getDeviceState())
		{
			setValue = "value=true"
		}
		else
		{
			setValue = "value=false"
		}

		console.log("** (" + getCurrentTime() + ") ALERT ** Alert being sent for device - " + _alertDeviceName + ": State is " + setValue);

		if (_indigoConfiguration.isPasswordProtected())
		{
			_needle.put(_alertIndigoVariableURL, setValue, { username: _indigoConfiguration.getIndigoUserName(), password: _indigoConfiguration.getIndigoPassword(), auth: 'digest' }, function() {
				//
			})
		}
		else
		{
			_needle.put(_alertIndigoVariableURL, setValue, function() {
				//
			})
		}

		_indigoState = this.getDeviceState();
	}
}

module.exports = NetworkDevice;