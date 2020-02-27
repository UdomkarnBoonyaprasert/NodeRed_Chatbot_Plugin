const AssistantV1 = require('ibm-watson/assistant/v1');
const {
    IamAuthenticator
} = require('ibm-watson/auth');

function createId(i){
    let str ="node_" + i + "_15812";
    for(let i = 0; i < 8; i++){
        str += Math.floor(Math.random()*10).toString();
    }
    return str
}

let workspaceid;

module.exports = function(RED) {
    function createIntent(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        var nodeId = config.dialogName;
        var dialogTitle = config.dialogName;
        var outputs = [];
        var policy = config.selection_policy; //how are reponse texts set
        var condition = "#" + config.name;
        var resType = "text";
        var previousDialog = "Welcome";
        var dialogType = "standard";

        for (var i=0; i < config.outputs.length;i++) {
            var output = config.outputs[i];
            outputs.push({
                text: output.outputContent
            });
        };


        node.on('input', function(msg) {

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

            console.log(msg);

            const params = {
                //workspaceId: '9d74b2b9-1973-4ab8-90ec-bc45ed12622e',
                workspaceId: msg.payload.workspaceId,
                intent: config.name,
                description: config.description,
                examples: []
            };
			for (var i=0;i<config.examples.length;i++) {
				var example = config.examples[i];
				params.examples.push({
                        text: example.exampleContent
                    });
			};
			
            this.assistant.createIntent(params)
                .then(res => {
                    console.log(JSON.stringify(res, null, 2));
                    node.send(msg);

                    this.assistant.listDialogNodes({
                        //workspaceId: '9d74b2b9-1973-4ab8-90ec-bc45ed12622e'
                        workspaceId: msg.payload.workspaceId,
                    })
                        .then(res =>{
                            var json = JSON.stringify(res, null, 2);
                            var object = JSON.parse(json);
                            var hasDialog = false;

                            if(object.result.dialog_nodes.length > 0){
                                //set the previous dialog node
                                previousDialog = object.result.dialog_nodes[0].dialog_node;
                                console.log("first dialog:" + previousDialog);

                                //reset the dialog nodeId
                                for (let i = 0; i < object.result.dialog_nodes.length; i++) {
                                    if (object.result.dialog_nodes[i].dialog_node === nodeId) {
                                        nodeId = createId(i);
                                        console.log("NodeIde conflict! New Id:"+ nodeId);
                                    }
                                }
                            }
                            else{
                                //for the first dialog node
                                previousDialog = '';
                                console.log("no dialog:" + previousDialog);
                            }





                            this.assistant.createDialogNode({
                                //workspaceId: '9d74b2b9-1973-4ab8-90ec-bc45ed12622e',
                                workspaceId: msg.payload.workspaceId,
                                dialogNode : nodeId,
                                conditions: condition,
                                //parent: n.parent,
                                previousSibling: previousDialog,
                                output: {
                                    generic: [
                                        {
                                            values: outputs,
                                            /*[
                                                {
                                                    text: outputs, //response text
                                                }
                                            ],
                                            */
                                            response_type: resType,
                                            selection_policy: policy,  //sequential,random,multiline
                                        }
                                    ]
                                },
                                title: dialogTitle,
                                type: dialogType
                            })
                                .then(res => {
                                    console.log(JSON.stringify(res,null,2));
                                    msg.payload = "DialogNode created";
                                    node.send(msg);
                                })
                                .catch(err =>{
                                    console.log(err);
                                    msg.payload = "Creating nodes failed!";
                                    node.send(msg);
                                });

                        })
                        .catch(err =>{
                            console.log(err);
                        });

                })
                .catch(err => {
                    node.error("Error", err);
                    console.log(err);
                });
        });
    }

    RED.nodes.registerType("createIntent", createIntent);
}