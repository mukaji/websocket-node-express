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

module.exports = {
    finalAnalytic: function () {
        finalAnalyticProcess();
    }
}

async function finalAnalyticProcess() {
    while (true) {
        try {
            var connection = mysql.createConnection({
                host: dbhost,
                user: dbuser,
                password: dbpassword,
                database: dbschema
            });
            connection.connect()

            var sql = ' select * from job where used is null and ishuman is not null and islight is not null';
            connection.query(sql, function (err, rows) {
                if (err) {
                    console.log("ERROR finalAnalyticProcess:" + err.message);
                } else {
                    /* for each row for analytic use room */
                    doEachRows(rows);
                }
            })

            connection.end()
        } catch (error) {
            console.log("ERROR finalAnalyticProcess:" + error.message);
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
    var id, ishuman, isair, islight, percent,hour;
    var used = 0;
    var index = 0, score = 0,total=10;
    for (let i = 0; i < rows.length; i++) {
        used = 0;
        score = 0;
        percent=0;
        id = rows[i].id;
        ishuman = rows[i].ishuman;
        isair = rows[i].isair;
        islight = rows[i].islight;
        hour = rows[i].hour;
        if (ishuman != null && ishuman == 1) {
            used = 1;
        } else if (islight != null && islight == 1) {
            used = 1;
        } else if (isair != null && isair == 1) {
            used = 1;
        }
         /* check night time 19:00 - 5:00 */
         if ((hour >= 19 && hour <= 24) || (hour >= 0 && hour <= 5)) {
             //night 
             total=3;
             if (ishuman == 1) score = score + 1;
             if (islight == 1) score = score + 1;
             if (isair == 1) score = score + 1;
         }else{
             //day
             total=2;
             if (ishuman == 1) score = score + 1; 
             if (isair == 1) score = score + 1;
         }
       
        if (score == 0) {
            percent = 0; 
        } else {
            percent = (score * 100) / total;
            if(percent>=100) percent=100;
        }
        console.log("id=" + id + " ishuman=" + ishuman + " islight=" + islight + " isair=" + isair + " used=" + used + " score="+score+" percent=" + percent+" hour="+hour);
        //update used
        updateUsed(id, used, percent);
        if (index >= 50) {
            index = 0;
            await delay(3000);
        }
        index++;

    }
}


async function updateUsed(id, used, percent) {
    var parameters = [used, percent, id];
    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });

    connection.connect()
    /* update used */
    connection.query('update job set used=?,percentused=? where id=?  ', parameters, function (err, rows, fields) {
        if (err) {
            console.log("ERROR updateUsed:" + err.message);

        } else {
            //console.log("UPDATE SUCCESS USED id=" + id + " used=" + used);
        }
    })
    connection.end()
}
