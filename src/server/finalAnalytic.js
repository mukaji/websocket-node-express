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
    var id, ishuman, isair, islight, percent;
    var used = 0;
    var index = 0, score = 0;
    for (let i = 0; i < rows.length; i++) {
        used = 0;
        id = rows[i].id;
        ishuman = rows[i].ishuman;
        isair = rows[i].isair;
        islight = rows[i].islight;
        if (ishuman != null && ishuman == 1) {
            used = 1;
        } else if (islight != null && islight == 1) {
            used = 1;
        } else if (isair != null && isair == 1) {
            used = 1;
        }
        if (ishuman == 1) score++;
        if (islight == 1) score++;
        if (isair == 1) score++;
         
        percent = (score * 100) / 3;
        console.log("id=" + id + " ishuman=" + ishuman + " islight=" + islight + " isair=" + isair + " used=" + used+" percent="+percent);
        //update used
        updateUsed(id, used,percent);
        if (index >= 50) {
            index = 0;
            await delay(3000);
        }
        index++;

    }
}


async function updateUsed(id, used,percent) {
    var parameters = [used,percent, id];
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
