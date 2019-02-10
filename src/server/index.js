const express = require('express');
const app = express();

let date = require('date-and-time');

var updateDiff = require("./updateDiff");
var temp = require("./getTemperature");
var analytic = require("./analytic");
var finalAnalytic = require("./finalAnalytic");
var member = require('./member');

/* db configuration */
var mysql = require('mysql')
var fs = require('fs');
var configPath = './config.json';
var parsed = JSON.parse(fs.readFileSync(configPath, 'UTF-8'));
exports.storageConfig = parsed;
const dbhost = exports.storageConfig.mysql.dbhost;
const dbuser = exports.storageConfig.mysql.dbuser;
const dbpassword = exports.storageConfig.mysql.dbpassword;
const dbschema = exports.storageConfig.mysql.dbschema;

var json2html = require('node-json2html');

app.use(express.static("dist"));
var bodyParser = require('body-parser');
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

app.get('/', (req, res) => {
    res.send('');
});

app.get('/show', function (req, res) {

    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });

    connection.connect()

    var sql = 'select id,celsius,ismove,light,hour,isair,ishuman,islight,tambontemp,used,percentused,diff from job order by id desc limit 0,20  ';
    connection.query(sql, function (err, results) {
        if (err) {
            console.log("ERROR:" + err.message);
            res.send("ERROR:" + err.message);
        } else {
            // json to table
            var transform = { "<>": "div", "html": "${id} | ${celsius} | ${diff} | ${ismove} | ${light} | ${isair} | ${ishuman} | ${islight} | ${hour}| ${tambontemp} | ${used} | ${percentused}" };
            var html = json2html.transform(results, transform);
            html = "id | celsius | diff | ismove | light | isair | ishuman | islight | hour | tambontemp | used | percentused<br/>" + html;
            res.send(html);
        }
    })

    connection.end()
});

/* Get hotel data by memberid */
app.get('/hotel-getstatus', function (req, res) {

    var memberid = req.body.memberid;
    var startdate = req.body.startdate;
    var enddate = req.body.enddate;
    var parameters = [memberid, startdate, enddate];

    if (memberid == undefined) {
        console.log("ERROR: memberid is undefined");
        res.send("INVALID PARAMETER");
        return;
    }
    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });

    connection.connect()

    var sql = 'select j.* '
    sql += 'from job j ';
    sql += 'inner join memberdevice md on md.deviceid=j.deviceid ';
    sql += 'where md.memberid=? ';
    sql += 'and createddate between ? and ? ';
    connection.query(sql, parameters, function (err, results) {
        if (err) {
            console.log("ERROR:" + err.message);
            res.send("ERROR:" + err.message);
        } else {
            console.log('results: ', results)
            res.send(results);
        }
    })

    connection.end()
});

/* Insert data into hotel */
app.post('/hotel-monitor', function (req, res) {

    getActiveDevice(function (err, isActive) {
        if (isActive == false) {
            res.send("BLOCK");
        } else {
            /* insert data */
            insertData(req, res);
        }
    }, req.body.deviceid);

});

/* signup */
app.post('/signup', function (req, res) {

    var email = req.body.email;
    var password = req.body.password;
    var isok = member.memberSignUp(email, password, res);
    console.log("isok=" + isok);
    res.send("isok=" + isok);
});

app.listen(8080, () => startUp());

function startUp() {
    console.log("Listening on port 8080!");
    /* start get temperature from open api */
    temp.updateTemp();
    /* start analytic room usage */
    analytic.analyticJob();
    /* start final Analytic */
    finalAnalytic.finalAnalytic();
    /* update diff between current temp and previous temp */
    updateDiff.updateDiff();
}

/* FUNCTION */

/* check device is active or not */
var getActiveDevice = function (callback, deviceid) {
    var isActive = false;
    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });

    connection.connect()
    connection.query("select id from device where disabled=0 and id=? ", deviceid, function (err, res) {
        if (err) {
            console.log("ERROR:" + err.message);
        } else {
            if (res.length == 0) {
                isActive = false;
            } else {
                isActive = true;
            }
        }
        callback(null, isActive);
    });
    connection.end()
}

/* insert data from device to database */
function insertData(req, res) {
    var deviceid = req.body.deviceid;
    var celsius = req.body.celsius;
    var ismove = req.body.ismove;
    var light = req.body.light;
    var parameters = [deviceid, celsius, ismove, light];

    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });
    connection.connect()

    /* insert into table job */
    connection.query('insert into job(deviceid,celsius,ismove,light,day,month,year,hour,minute,sec,createddate)' +
        ' values(?,?,?,?,day(now()),month(now()),year(now()),hour(now()),minute(now()),second(now()),now())', parameters, function (err, rows, fields) {
            if (err) {
                console.log("ERROR InsertJob:" + err.message);
                res.send("ERROR:" + err.message);
            } else {
                res.send('SUCCESS');
            }
        })

    /* insert into table device */
    connection.query('update device set updateddate=now() where id=? and disabled=0 ', deviceid, function (err, rows, fields) {
        if (err) {
            console.log("ERROR UpdateDeviceUpdateddate:" + err.message);
            res.send("ERROR:" + err.message);
        } else {
            // console.log('UPDATE SUCCESS: deviceid='+deviceid + ' date='+ date.format(new Date(), 'YYYY-MM-DD HH:mm:ss'));

        }
    })
    connection.end()
}
