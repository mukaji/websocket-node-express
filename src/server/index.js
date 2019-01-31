const express = require('express');
const app = express();  
var mysql = require('mysql')
let date = require('date-and-time');
var fs = require('fs'); 
var configPath = './config.json';
var parsed = JSON.parse(fs.readFileSync(configPath, 'UTF-8'));
exports.storageConfig=  parsed;

const dbhost=exports.storageConfig.mysql.dbhost;
const dbuser=exports.storageConfig.mysql.dbuser;
const dbpassword=exports.storageConfig.mysql.dbpassword;
const dbschema=exports.storageConfig.mysql.dbschema;

app.use(express.static("dist"));
var bodyParser = require('body-parser');
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies
  
app.get('/', (req, res) => {
    res.send('Hi!');
});

/* Get hotel data by memberid */
app.get('/hotel-getstatus', function (req, res) {
     
    var memberid = req.body.memberid;
    var startdate=req.body.startdate;
    var enddate=req.body.enddate;
    var parameters=[memberid,startdate,enddate];

    if(memberid==undefined){
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

    var sql='select j.* '
    sql+='from job j ';
    sql+='inner join memberdevice md on md.deviceid=j.deviceid ';
    sql+='where md.memberid=? ' ;
    sql+='and createddate between ? and ? '; 
    connection.query(sql,parameters, function (err, results) {
        if (err){
            console.log("ERROR:"+err.message);
            res.send("ERROR:"+err.message);
        } else{ 
            console.log('results: ', results)
            res.send(results);
        }
    })

    connection.end()
});

/* Insert data into hotel */
app.post('/hotel-monitor', function(req,res){
    
    var deviceid = req.body.deviceid;
    var humidity = req.body.humidity;
    var celsius = req.body.celsius;
    var fahrenheit = req.body.fahrenheit;
    var ismove = req.body.ismove;
    var distance = req.body.distance;
  
    var parameters=[deviceid,humidity,celsius,fahrenheit,ismove,distance];
    
    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });

    connection.connect()

    connection.query('insert into job(deviceid,humidity,celsius,fahrenheit,ismove,distance,day,month,year,hour,minute,sec,createddate)'+
    ' values(?,?,?,?,?,?,day(now()),month(now()),year(now()),hour(now()),minute(now()),second(now()),now())',parameters, function (err, rows, fields) {
        if (err){
            console.log("ERROR:"+err.message);
            res.send("ERROR:"+err.message);
        } else{
            console.log('SUCCESS: deviceid='+deviceid + ', humidity=' + humidity + ', celsius=' + celsius+', fahrenheit='+fahrenheit+', ismove='+ismove+', distance='+distance+', date='+ date.format(new Date(), 'YYYY-MM-DD HH:mm:ss'));
            res.send('SUCCESS');
        }
    })

    connection.end()
});

app.post('/hotel-monitor-dummy', function(req,res){
    
    var deviceid = req.body.deviceid;
    var humidity = req.body.humidity;
    var celsius = req.body.celsius;
    var fahrenheit = req.body.fahrenheit;
    var ismove = req.body.ismove;
    var distance = req.body.distance;
    var day = req.body.day;
    var month = req.body.month;
    var year = req.body.year;
    var hour = req.body.hour;
    var minute = req.body.minute;
    var createddate=req.body.createddate;
    var parameters=[deviceid,humidity,celsius,fahrenheit,ismove,distance,day,month,year,hour,minute,createddate];
   
  
    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });

    connection.connect()

    connection.query('insert into job(deviceid,humidity,celsius,fahrenheit,ismove,distance,day,month,year,hour,minute,createddate)'+
    ' values(?,?,?,?,?,?,?,?,?,?,?,?)',parameters, function (err, rows, fields) {
        if (err){
            console.log("ERROR:"+err.message);
            res.send("ERROR:"+err.message);
        } else{
            console.log('SUCCESS: deviceid='+deviceid + ', minute=' + minute + ', createddate=' + createddate);
            res.send('SUCCESS');
        }
    })

    connection.end()
});

app.listen(8080, () => console.log("Listening on port 8080!"));

