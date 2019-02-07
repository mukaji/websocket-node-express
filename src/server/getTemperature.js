
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
 
/* api.openweathermap.org */
var APPID = "0953fe3e5d129978eb1e08e2fca99f76";
const request = require('request');

module.exports = {

    updateTemp: function () {
        var timeMs = 10800000;
        //do at the first time 
        updateTempPerAmphoe();
        //update temperature every 3 hours (10800000 ms) 
        //setInterval(updateTempPerAmphoe, timeMs); 
    }
}

async function updateTempPerAmphoe() {
    while (true) { 
        try { 
            var connection = mysql.createConnection({
                host: dbhost,
                user: dbuser,
                password: dbpassword,
                database: dbschema
            });

            connection.connect()
            var sql = ' select distinct t.id,t.tambon,t.lat,t.lon,t.temperature,t.updateddate ';
            sql += ' from tambon t inner join device d on d.tambonid=t.id ';
            //var sql='select distinct t.id,t.tambon,t.lat,t.lon,t.temperature,t.updateddate from tambon t';
            connection.query(sql, function (err, rows) {
                if (err) {
                    console.log("ERROR:" + err.message); 
                } else {
                    /* for each tambon update temperature */ 
                    doEachRows(rows);
                }
            })

            connection.end()

        } catch (error) {
            console.log("ERROR:" + error.message);
        } finally { 
            await delay(60000);//sleep 1 minute   
        }
    }
}

const delay = (amount = number) => {
    return new Promise((resolve) => {
        setTimeout(resolve, amount);
    });
}
async function doEachRows(rows) {
    var lat, lon, id, url, temperature, tambon;
    var index = 0;
    for (let i = 0; i < rows.length; i++) {
        id = rows[i].id;
        lat = rows[i].lat;
        lon = rows[i].lon;
        tambon = rows[i].tambon;
        /* call api get temperature */
        url = "http://api.openweathermap.org/data/2.5/weather?lat=" + lat + "&lon=" + lon + "&units=metric&APPID=" + APPID;

        //call web service
        initialize(url, id, tambon).then(function (data) {
            // get the output 
            var outputs = data;
            id = outputs[0];
            tambon = outputs[1];
            temperature = outputs[2].main["temp"];
            // update temperature in to db
            updateTempDB(id, temperature, tambon);
        });
        if (index >= 45) {
            //call 45 connections and then sleep 1 minute
            index = 0;
            await delay(60000);//sleep 1 minute  
        }
        index++;

    }
}

function initialize(sUrl, id, tambon) {

    // Setting URL and headers for request
    var options = {
        url: sUrl,
        headers: {
            'User-Agent': 'request'
        }
    };
    // Return new promise
    return new Promise(function (resolve, reject) {
        // Do async job
        request.get(options, function (err, resp, body) {
            if (err) {
                console.log("ERROR");
                reject(err);
            } else {
                var outputs = [id, tambon, JSON.parse(body)];
                resolve(outputs);
            }
        });
    });

}

function updateTempDB(id, temperature, tambon) {
    var parameters = [temperature, id];
    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });

    connection.connect()
    /* update temperature */
    connection.query('update tambon set temperature=?, updateddate=now() where id=?  ', parameters, function (err, rows, fields) {
        if (err) {
            console.log("ERROR:" + err.message); 
        } else {
            console.log("UPDATE SUCCESS TEMP id=" + id + " tambon=" + tambon + " temp=" + temperature);
        }
    })
    connection.end()
}