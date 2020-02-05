var should = require("should");
var helper = require("node-red-node-test-helper");
var deleteWatsonNode = require("../nodes/delete_watson/deleteWatson.js");
const testNode = 'testCreateWatson';
const AssistantV1 = require('ibm-watson/assistant/v1');

const {
    IamAuthenticator
} = require('ibm-watson/auth');


const apikey = "NYLBfhff5TKngBCwOxjfRp7dIipvFPm_v1yo_XlR_K7W";
const urlHost = "https://api.eu-gb.assistant.watson.cloud.ibm.com/instances/a20b257b-83f7-44a4-8093-2553e67aa381";

let json;


const watson_assistant = new AssistantV1({
    version: '2019-02-08',
    authenticator: new IamAuthenticator({
        apikey: apikey, //change this api key to your to modify your own workspace
    }),
    url: urlHost
});

helper.init(require.resolve('node-red'));

function waitFor(time) {
    // wait time and resolve
    return new Promise(resolve => setTimeout(resolve, time))
}

describe('Delete Watson Node', function() {

    beforeEach(function(done) {
        helper.startServer(done);
    });

    afterEach(function(done) {
        helper.unload();
        helper.stopServer(done);
    });

    it('should be loaded', function(done) {
        var flow = [{
            id: "n1",
            type: "deleteWatson",
            name: testNode
        }];
        helper.load(deleteWatsonNode, flow, function() {
            var n1 = helper.getNode("n1");
            n1.should.have.property('name', testNode);
            done();
        });
    });

    it('should be connected', function(done) {
        var statusCode;
        watson_assistant.listWorkspaces()
            .then(res => {
                statusCode = JSON.parse(JSON.stringify(res, null, 2))['status'];
                should.equal(statusCode, 200);
                done();
            })
            .catch(err => {
                done(err);
            });
    });


    it('workspace should not exist', function(done) {
        this.timeout(10000);
        var found = false;
        var flow = [{
            id: "n1",
            type: "deleteWatson",
            name: testNode
        }];
        helper.load(deleteWatsonNode, flow, function() {
            var n1 = helper.getNode("n1");
            watson_assistant.createWorkspace({
                    name: testNode,
                    description: 'for testing delete'
                })
                .then(res => {
                    n1.receive({
                        payload: {
                            chatbot_name: testNode,
                            wa_api_key: apikey,
                            ta_api_key: "",
                            discovery_api_key: "",
                            instance_url: urlHost,
                        }
                    }); //not really working? how to ensure this node finish the api call?
                    waitFor(2000).then(() => { //wait for internal api call from node red. currently no way of accessing promise from n1
                        watson_assistant.listWorkspaces()
                            .then(res => {

                                var listOfWorkSpaces = JSON.parse(JSON.stringify(res, null, 2));
                                for (var workspace in listOfWorkSpaces['result']['workspaces']) {
                                    if (listOfWorkSpaces['result']['workspaces'][workspace]['name'] === testNode) {
                                        found = true;
                                    }
                                }
                                should.equal(found, false);
                                done();
                            })
                            .catch(err => {
                                done(err);
                            });

                    })
                })
                .catch(err => {
                    console.log(err)
                });


        });

    });
});