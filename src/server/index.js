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

    getActiveDevice(function(err,isActive){
        console.log("isActive="+isActive);
        if(isActive==false){
            res.send("BLOCK"); 
        }else{
            /* insert data */
            insertData(req,res);
        }
    },req.body.deviceid);
  
});
 
app.listen(8080, () => console.log("Listening on port 8080!"));

/* FUNCTION */

/* check device is active or not */
var  getActiveDevice = function(callback,deviceid) {
    var isActive=false;
    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });
    
    connection.connect()  
    connection.query("select id from device where disabled=0 and id=? ",deviceid, function (err, res) {
        if (err){
            console.log("ERROR:"+err.message); 
        } else{    
             if(res.length==0){
                isActive=false;
             }else{
                isActive=true;
             }
        }
        callback(null, isActive);
    });  
    connection.end()
}

/* insert data from device to database */
function insertData(req,res){
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

    /* insert into table job */
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

    /* insert into table device */
    connection.query('update device set updateddate=now() where id=? and disabled=0 ',deviceid, function (err, rows, fields) {
        if (err){
            console.log("ERROR:"+err.message);
            res.send("ERROR:"+err.message);
        } else{
            console.log('UPDATE SUCCESS: deviceid='+deviceid + ' date='+ date.format(new Date(), 'YYYY-MM-DD HH:mm:ss'));
            
        }
    })
    connection.end()
}
 