function IndigoConfiguration () {
	var _isPasswordProtected;
	var _indigoPassword;
	var _indigoUserName;
	var _ip;
	var _port;
	var _variableRefreshRate = 5 * 60 * 1000;

	this.setCredentials = function(indigoUserName, indigoPassword) {
		_indigoUserName = indigoUserName;
		_indigoPassword = indigoPassword;
		if (typeof _indigoPassword === 'undefined') _isPasswordProtected = false;
		else _isPasswordProtected = _indigoPassword.length > 0;
	}

	this.setIndigoUserName = function(indigoUserName) {
		this.setCredentials(indigoUserName, _indigoPassword);
	}

	this.setIndigoPassword = function(indigoPassword) {
		this.setCredentials(_indigoUserName, indigoPassword);
	}

	this.isPasswordProtected = function() {
		return _isPasswordProtected;
	}

	this.getIndigoPassword = function () {
		return _indigoPassword;
	}

	this.getIndigoUserName = function () {
		return _indigoUserName;
	}

	this.getIndigoVariableRefreshRate = function () {
		return _variableRefreshRate;
	}

	this.setIndigoVariableRefreshRate = function(interval) {
		_variableRefreshRate = interval * 60 * 1000;
	}
}

module.exports = IndigoConfiguration;