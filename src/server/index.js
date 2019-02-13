const express = require('express');


var temp = require("./getTemperature");
var member = require('./member');
var processDB = require("./processDB");
var processAnalytic = require("./processAnalytic");
var finalAnalytic = require("./finalAnalytic");

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
const SERVER = exports.storageConfig.SERVER;


const app = express();
/* HTTPS */
var https = require('https');
var key = fs.readFileSync('encryption/nodict.key');
var cert = fs.readFileSync('encryption/e0d6f70a38853bb3.crt');
var ca  = fs.readFileSync('encryption/gd_bundle-g2-g1.crt');


if (SERVER == "DEV") {
    app.listen(8080, () => startUp(8080));
} else if (SERVER == "PROD") {
    console.log("PROD");
    var options = {
        key: key,
        cert: cert,
        ca: ca
    };
    //https.createServer(options, app).listen(443);
    //startUp(443)
    app.listen(80, () => startUp(80));
}



function startUp(port) {
    console.log("Listening on port " + port + "!");
    /* start get temperature from open api */
    temp.updateTemp();

    //find diff & diffsum10
    processDB.processDB();
    //update ishuman, islight
    processAnalytic.processAnalytic();
    /* start final Analytic */
    finalAnalytic.finalAnalytic();

}

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

    var sql = 'select id,celsius,ismove,light,hour,isair,ishuman,islight,tambontemp,used,percentused,diff,diffsum10 from job order by id desc limit 0,20  ';
    connection.query(sql, function (err, results) {
        if (err) {
            console.log("ERROR:" + err.message);
            res.send("ERROR:" + err.message);
        } else {
            // json to table
            var html = "<style>";
            html += "#customers {";
            html += "font-family: \"Trebuchet MS\", Arial, Helvetica, sans-serif;";
            html += "border-collapse: collapse;";
            html += "width: 100%;";
            html += "}";

            html += "#customers td, #customers th {";
            html += "border: 1px solid #ddd;";
            html += "padding: 8px;";
            html += "}";

            html += "#customers tr:nth-child(even){background-color: #f2f2f2;}";

            html += "#customers tr:hover {background-color: #ddd;}";

            html += "#customers th {";
            html += "padding-top: 12px;";
            html += "padding-bottom: 12px;";
            html += "text-align: left;";
            html += "background-color: #4CAF50;";
            html += "color: white;";
            html += "}";
            html += "</style>";
            html += "<table id=\"customers\"><tr>";
            html += "<td>id</td><td>celsius</td><td>diff</td><td>diffsum10</td><td>ismove</td><td>light</td><td>hour</td><td>isair</td><td>ishuman</td><td>islight</td><td>tambontemp</td><td>used</td><td>percentused</td>";
            html += "</tr>";

            var id, celsius, ismove, light, hour, isair, ishuman, islight, tambontemp, used, percentused, diff, diffsum10;
            for (let i = 0; i < results.length; i++) {
                id = results[i].id;
                celsius = results[i].celsius;
                ismove = results[i].ismove;
                light = results[i].light;
                hour = results[i].hour;
                isair = results[i].isair;
                ishuman = results[i].ishuman;
                islight = results[i].islight;
                tambontemp = results[i].tambontemp;
                used = results[i].used;
                percentused = results[i].percentused;
                diff = results[i].diff;
                diffsum10 = results[i].diffsum10;
                html += "<tr>";
                html += "<td>" + id + "</td><td>" + celsius + "</td><td>" + diff + "</td><td>" + diffsum10 + "</td><td>" + ismove + "</td><td>" + light + "</td><td>" + hour + "</td><td>" + isair + "</td><td>" + ishuman + "</td><td>" + islight + "</td><td>" + tambontemp + "</td><td>" + used + "</td><td>" + percentused + "</td>";
                html += "</tr>";
            }
            html += "</table>";
            //var transform = { "<>": "div", "html": "${id} | ${celsius} | ${diff} | ${diffsum10} | ${ismove} | ${light} | ${isair} | ${ishuman} | ${islight} | ${hour}| ${tambontemp} | ${used} | ${percentused}" };
            //var html = json2html.transform(results, transform);
            //html = "id | celsius | diff | diffsum10 | ismove | light | isair | ishuman | islight | hour | tambontemp | used | percentused<br/>" + html;
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
    if (validateEmail(email)) {
        member.memberSignUp(email, password, res);
    } else {
        res.send("ERROR:Invalid email address");
    }
});

/* login */
app.post('/login', function (req, res) {
    var email = req.body.email;
    var password = req.body.password;
    if (validateEmail(email)) {
        member.memberLogin(email, password, res);
    } else {
        res.send("ERROR:Invalid email address");
    }
});



function validateEmail(email) {
    var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
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
