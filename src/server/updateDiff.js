
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
/* this function will update diff between current temp and previous temp (1 minute) */
module.exports = {

    updateDiff: function () {
        updateDiffProcess();
    }
}

async function updateDiffProcess() {
    while (true) {
        try {
            var connection = mysql.createConnection({
                host: dbhost,
                user: dbuser,
                password: dbpassword,
                database: dbschema
            });
            connection.connect()
            /* select each deviceid */
            var sql = "  select id from device where disabled=0 ";
            connection.query(sql, function (err, rows) {
                if (err) {
                    console.log("ERROR updateDiffProcess:" + err.message);
                } else {
                    /* do each deviceid */
                    var deviceid;
                    for (let i = 0; i < rows.length; i++) {
                        deviceid = rows[i].id;
                        doEachDeviceId(deviceid);
                    }
                }
            })

            connection.end()

        } catch (error) {
            console.log("ERROR updateDiffProcess:" + error.message);
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
async function doEachDeviceId(deviceid) {
    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });
    connection.connect()
    /* get job by deviceid where diff is null */
    var sql = ' select j.id,j.celsius,j.createddate,j.deviceid from job j  where j.deviceid=? order by j.id desc limit 0,2 ';
    connection.query(sql, deviceid, function (err, rows) {
        if (err) {
            console.log("ERROR updateDiffProcess:" + err.message);
        } else {
            /* do each rows */
            doEachRows(rows);
        }
    })

    connection.end()
}
async function doEachRows(rows) {
    var index = 0;
    var temp, tempPrevious, diff, date, datePrevious,deviceid;
    var dt1, dt2, minutes;
    for (let i = 0; i < rows.length; i++) {  
        id = rows[i].id; 
        if (i >= rows.length-1) {  
            break;
        }
        deviceid=rows[i].deviceid;
        date = rows[i].createddate;
        datePrevious = rows[i + 1].createddate;
        temp = rows[i].celsius;
        tempPrevious = rows[i + 1].celsius;
        diff = temp - tempPrevious;
        dt1 = new Date(date);
        dt2 = new Date(datePrevious);
        /* get time diff between current and previous */
        minutes = Math.floor(Math.abs(dt1 - dt2) / 1000 / 60) % 60;
        if (minutes >= 10) { 
            /* each record diff more than 10 minute then set diff=0 */ 
            updateRowNotUpdateMoreThan10Minutes(id);
             
        } else {
            /* update diff each record */  
            updateTempDB(id, diff);
        }
        index++;
        if(index>=50){
            index=0;
            await delay(3000);//sleep 3 sec
        }
    }
}
function updateTempDB(id, diff) {
    var parameters = [diff, id];
    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });

    connection.connect()
    /* update diff temperature */
    connection.query('update job set diff=ROUND(?,2)  where id=?  ', parameters, function (err, rows, fields) {
        if (err) {
            console.log("ERROR updateTempDB:" + err.message);
        } else {
            console.log("UPDATE SUCCESS DIFFTEMP id=" + id + " diff=" + diff);
        }
    })
    connection.end()
}


function updateRowNotUpdateMoreThan10Minutes(id) {
     
    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });

    connection.connect()
    /* update diff temperature */
    connection.query('update job set diff=0, diffsum10=0, isair=null  where id=?  ', id, function (err, rows, fields) {
        if (err) {
            console.log("ERROR updateRowNotUpdateMoreThan10Minutes:" + err.message);
        } else {
            console.log("UPDATE SUCCESS updateRowNotUpdateMoreThan10Minutes id=" + id );
        }
    })
    connection.end()
}