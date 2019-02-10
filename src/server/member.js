
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

    memberSignUp: function (email, password, res) {
        return SignUp(email, password, res);
    }
}

function SignUp(email, password, res) {

    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });

    connection.connect()
    var sql = ' select email from member where email=? ';
    connection.query(sql, email, function (err, rows) {
        if (err) {
            console.log("ERROR SelectTambon:" + err.message);
        } else {
            if (rows.length == 0) {
                //insert db
                insertMember(email, password);
                return true;
            } else {
                console.log("DUP");
                return false;
            }
        }
    })

    connection.end()

}


function insertMember(email, password) {
    var parameters = [email, password];
    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });

    connection.connect()
    var sql = ' insert into member(id,email,password,memberstatuscode,createddate) values(uuid(),?,?,0,now()) ';
    connection.query(sql, parameters, function (err, rows) {
        if (err) {
            console.log("ERROR SelectTambon:" + err.message);
        } else {
            console.log("INSERT SUCCESS");
        }
    })

    connection.end()

}