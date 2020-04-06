const AssistantV1 = require('ibm-watson/assistant/v1');
const {
    IamAuthenticator
} = require('ibm-watson/auth');

let workspaceid;
const promise_queue = require('../scripts/queue.js');
/**
 * @class Dialog
 * @classdesc This class is for the dialog node in the system. It allows users to create a
 * dialog node in the chatbot such as in the backend system
 * @param RED Node Red Object
 */
module.exports = function (RED) {


    /**
     * @function Reference Value
     * @memberOf Dialog
     * @description Function to format the reference for the api call. This relates to how dialog nodes check entities.
     * Converting from plain text to specific formats
     * @param {string} sendType Entity or Intent symbol
     * @param {string} sendValue Name of entity or intent
     * @param {string} relationType  relationship to entity value in dialog
     * @param {string} relationValue Value of entity
     * @return {string} formatted version of params for api call
     */
    function getReferenceValue(sendType, sendValue, relationType, relationValue) {
        let result;
        if (sendType == "#") {
            result = sendType + sendValue;
        } else {
            switch (relationType) {
                case "any": {
                    result = sendType + sendValue;
                    break;
                }
                case "is": {
                    result = sendType + sendValue + ":" + relationValue;
                    break;
                }
                case "is_not": {
                    result = sendType + sendValue + " != \"" + relationValue + "\"";
                    break;
                }
                case "greater": {
                    result = sendType + sendValue + " > " + relationValue;
                    break;
                }
                case "less": {
                    result = sendType + sendValue + " < " + relationValue;
                    break;
                }
            }
        }

        return result;

    }

    /**
     * @function Create Dialog Node
     * @memberOf Dialog
     * @description Main function for creating the dialog. Collects data from front end and constructs the API call.
     * Also handles the passing of data in and out of the node.
     * @param  {*} n Node Object
     */
    function createDialog(n) {
        RED.nodes.createNode(this, n);
        var node = this;
        this.name = n.name;
        this.intentName = n.intentName;
        this.intentDescription = n.intentDescription;
        console.log("start dialog");
        node.on('input', function (msg) {

            let self = this;


            /**
             * @inner Create Instance of API manager, collect from flow object if available
             */
            try {
                this.assistant = this.context().flow.get("assistant");
            } catch (e) {
                console.log("context not found");
            } finally {
                if (this.assistant == null || this.assistant == undefined) {
                    this.assistant = new AssistantV1({
                        version: '2019-02-08',
                        authenticator: new IamAuthenticator({
                            apikey: msg.payload.wa_api_key,
                        }),
                        url: msg.payload.instance_url
                    });
                }
            }


            /**
             * @inner Manage the IDs of the system, ids are kept unique by incrementation and the addition of random
             * characters
             */
            try {

                if (this.context().flow.get("ids") != undefined) {
                    this.id = this.context().flow.get("ids");
                } else {
                    this.id = 1;
                    this.context().flow.set("ids", this.id);
                }
                let nextID = this.id + 1;
                this.context().flow.set("ids", nextID);
            } catch (e) {
                console.log("catch error");
                this.id = 1;
                try{
                    this.context().flow.set("ids", this.id);
                }
                catch (e) {
                    console.log("flow write error");
                }
                
            }


            /**
             * @function check Siblings
             * @memberOf Dialog
             * @description check if this dialog node has a previous sibling. If so, add it as sibling for this node. Alternativly, add own id as simply dictionary.
             * @param {string} newID New id of current node
             * @return {string} sibling : the sibling node of this node
             */
            function checkSiblings(newID) {

                console.log(n.name);

                let siblings = self.context().flow.get("siblings");
                let previous_siblings = "";
                if (siblings[msg.payload.nodeID] != undefined) {

                    previous_siblings = siblings[msg.payload.nodeID].id;
                    console.log("->  " + siblings[msg.payload.nodeID].name);
                    siblings[msg.payload.nodeID] = {
                        id: newID,
                        name: n.name
                    };
                } else {
                    siblings[msg.payload.nodeID] = {
                        id: newID,
                        name: n.name
                    };
                }

                self.context().flow.set("siblings", siblings);
                return previous_siblings;
            }


            /**
             *
             * @inner Generate new id
             */
            this.id = this.id + Math.random().toString(36).substr(2, 10);

            /**
             * @function get Responses
             * @memberOf Dialog
             * @description
             * returns an output object that includes
             * the responses the user has created
             * in a format that matches the Watson API call 
             * @return {generic} Responses captured from the frontend
             */
            function getResponses() {

                var output = {
                    generic: []
                }

                var responses = n.dialog_response;
                for (var i = 0; i < responses.length; i++) {
                    if (responses[i].response_type === "image") {
                        var image = responses[i].image;
                        var response = {};
                        response.response_type = "image";

                        //if(responses[i].url != undefined){
                        response.source = image.source;
                        //console.log("source:" + image.source);
                        //}
                        if (image.title != undefined) {
                            response.title = image.title;
                        }
                        if (image.description != undefined) {
                            response.description = image.description;
                        }
                        output.generic.push(response);
                    } else if(responses[i].response_type === "option"){
                        var option = responses[i].option;
                        var response = {};

                        response.response_type = "option";
                        response.title = option.title;
                        if(option.description != undefined){
                            response.description = option.description;
                        }

                        response.options = [];
                        for(var i = 0; i < option.list.length; i++){
                            response.options.push({
                                label: option.list[i].label,
                                value: {
                                    input: {
                                      text: option.list[i].value  
                                    }
                                }
                            });
                        }

                        console.log(response);
                        output.generic.push(response);
                    } else if (responses[i].response_type === "text"){

                        output.generic.push({
                            values: [
                                {
                                    text: responses[i].responseContent
                                }
                            ],
                            response_type: "text"
                        })
                    }
                }
                return output;
            }


            let params = {
                workspaceId: msg.payload.workspaceId,
                parent: msg.payload.nodeID,
                previous_sibling: checkSiblings(this.id),
                dialogNode: this.id, //needs to be unique
                conditions: getReferenceValue(n.dialog_type, n.dialog_value, n.condition, n.conditionChoices),
                title: n.name,
                output: getResponses(),
                nextStep: {
                    behavior: n.userAction
                }
            };


            // console.log(params);
            let top = this;


            promise_queue.addToQueue(() => top.assistant.createDialogNode(params))
                .then(res => {

                    json = JSON.stringify(res, null, 2);
                    let object = JSON.parse(json);
                    let nodeID = top.id;
                    msg.payload.nodeID = nodeID;
                    msg.payload.discovery_api_key = msg.payload.discovery_api_key;
                    msg.payload.discoveryUrl = msg.payload.discoveryUrl;
                    node.status({fill: "green", shape: "ring", text: "Complete"});
                    node.send(msg);


                })
                .catch(err => {
                    console.log(err)
                    this.status({fill: "red", shape: "ring", text: "failed"});
                    //    "THIS IS ERROR OF" + this.id + "__________________________-\n\n" +
                });
        });

    }

    RED.nodes.registerType("dialog", createDialog);
}