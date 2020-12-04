'use strict';

class ServerlessPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    const awsService = this.serverless.getProvider('aws');
    
    const credentials = awsService.getCredentials();
    credentials.region = this.serverless.providers.aws.getRegion();
    
    this.cfnService = new awsService.sdk.CloudFormation(credentials);
    this.apigwService = new awsService.sdk.APIGateway(credentials);

    this.hooks = {
      'after:deploy:deploy': this.addTags.bind(this),
    };
  }

  tagResource(params) {
    this.cfnService.describeStackResources(params, (err, data) => {
      if (err) {
        this.serverless.cli.log('[ERROR]: Could not describe stack resources.');
        this.serverless.cli.log(err);
      } else {
        const apiDeploymentObj = data.StackResources.find((element) => {
          return element.ResourceType === 'AWS::ApiGateway::RestApi';
        });
        if (!apiDeploymentObj) {
          this.serverless.cli.log('Unable to resolve ApiGateway::RestApi.  No API Gateway stages tagged.');
        } else {
          const restApiId = apiDeploymentObj.RestApiId;

          if (this.serverless.service.custom && this.serverless.service.custom.apiStageTags) { 
            const apiParams = {
              resourceArn: `arn:aws:apigateway:${this.options.region}::/restapis/${restApiId}/stages/${this.options.stage}`,
              tags: this.serverless.service.custom.apiStageTags
            };

            // eslint-disable-next-line no-unused-vars
            this.apigwService.tagResource(apiParams, (apiErr, apiData) => {
              if (apiErr) {
                this.serverless.cli.log('[ERROR]: Could not tag API Gateway resource');
                this.serverless.cli.log(apiErr, apiErr.stack);
              } else {
                this.serverless.cli.log(`Tagged API gateway stage ${restApiId}/${this.options.stage}`);
              }
            });
          } else {
            this.serverless.cli.log('[WARNING]: No apiStageTags found to apply.');
          }
        }
      }
    });
  }

  addTags() {
    const awsService = this.serverless.getProvider('aws');
    const stackName = awsService.naming.getStackName();
    const params = { StackName: stackName };

    if (this.serverless.service.plugins.includes('serverless-plugin-split-stacks')
        && this.serverless.service.custom.splitStacks
        && this.serverless.service.custom.splitStacks.perType === true
    ) {
      this.cfnService.describeStackResources(params, (substackErr, substackData) => {
        if (substackErr) {
          this.serverless.cli.log('[ERROR]: Could not describe stack resources.');
        }
        const apiStack = substackData.StackResources.find((element) => {
          return element.LogicalResourceId === 'APINestedStack';
        });
        const apiParams = {
          StackName: apiStack.PhysicalResourceId.split('/')[1]
        };
        this.tagResource(apiParams);
      });
    } else {
      this.tagResource(params);
    }
  }
}

module.exports = ServerlessPlugin;
