"use strict";

var path = require("path"),
	express = require("express"),
	glob = require("glob"),
	util = require("util"),
	_ = require("lodash"),
	fs = require("fs"),
	Promise = require("bluebird"),
	argv = require('optimist')
	.argv,
	appModulePath = require('app-module-path')

process.on('uncaughtException', function (err) {

	console.log('uncaught exception: ' + err)
	if (err.stack) {
		console.log(err.stack)
	}
})

process.on('unhandledRejection', function (err) {

	console.log('unhandled rejection: ' + err)
	if (err.stack) {
		console.log(err.stack)
	}
})

var quickstart = {
	middleware: [],
	env: {},

	init: function (opts) {

		appModulePath.addPath(opts.root)
		quickstart.env = initEnvironment(opts.root)
		initConfig(opts.app)
		initTemplates(opts.app, opts.root, quickstart.env)
		initPublic(opts.app, opts.root)
		initEndpoints(opts.app, opts.root, opts.middleware)

		quickstart.middleware.push(on500, on404)
		opts.app.use(on500)
		opts.app.use(on404)
	}
}

module.exports = quickstart

function initConfig(app) {

	require("config")(app, quickstart.middleware)
}

function initEnvironment(root) {

	try {
		var envWritepath = path.join(root, "environment/index.json"),
			envName
		if (argv.production)
			envName = "production"
		else if (argv.development)
			envName = "development"
		else if (argv.environment) {
			envName = argv.environment
		} else
			envName = process.env.NODE_ENV ? process.env.NODE_ENV : "development"
		var envReadpath = path.join(root, "environment", envName + ".js"),
			env = require(envReadpath)
		fs.writeFileSync(envWritepath, JSON.stringify(env))
		var env = require(envWritepath)
		env.environment = envName
		return env
	} catch (err) {
		console.warn(util.format("unable to load environment file '%s'.js", envName))
		throw err
	}
}

function initEndpoints(app, root, middleware) {

	try {
		var routes = require("config/endpoints.json")
		_.each(routes, function (endpoint, route) {
			var pathTo = path.join("endpoints", endpoint),
				mod = require(pathTo)
			app.use(route, quickstart.middleware, mod)
		})
	} catch (err) {
		console.error("unable to load config/endpoints.json.", err)
		console.error(err.stack)
	}
}

function initPublic(app, root) {

	app.use(express.static(path.join(root, "public")))
}

function initTemplates(app, root, env) {

	var templatesDir
	switch (env.environment) {
		// TODO: uncomment this and figure it out? case "production":
		case "staging":
			templatesDir = ".tmp/templates"
			var tasks = require(path.join(root, "tasks", "production.js"))
			tasks.build()
			break
		default:
			templatesDir = "templates"
			var tasks = require(path.join(root, "tasks", "development.js"))
			tasks.watch()
	}
	app.set('views', path.join(root, templatesDir))
	app.set('view engine', 'ejs')
}

function on404(req, res, next) {

	res.status(404)
		.end("404 Not Found")
}

function on500(err, req, res, next) {

	console.error(err.stack)
	res.status(500)
		.end("Oops, something didn't go as expected.")
}

function requireDir(root, dir, expression) {

	if (!expression)
		expression = "**/*.js"
	var globPath = path.join(root, dir, expression)
	return new Promise(function (resolve, reject) {
		glob(globPath, {}, function (err, files) {
			if (err)
				return reject(err)
			var modules = _.map(files, function (file) {
				try {
					return require(file)
				} catch (err) {
					reject(err)
				}
			})
			resolve(modules)
		})
	})
}
