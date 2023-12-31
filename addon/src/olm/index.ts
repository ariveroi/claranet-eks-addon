import { ClusterAddOn, ClusterInfo } from "@aws-quickstart/eks-blueprints/dist/spi";
import { Construct } from 'constructs';
import { loadYaml } from "@aws-quickstart/eks-blueprints/dist/utils/yaml-utils";
import { KubectlProvider, ManifestDeployment } from "@aws-quickstart/eks-blueprints/dist/addons/helm-addon/kubectl-provider";
import * as assert from "assert";

const OLMDownloadURL = "https://github.com/operator-framework/operator-lifecycle-manager/releases/download/";

export interface OlmAddOnProps {
    /**
    * OLM version
    */
    version?: string
}

/**
 * Default OLM properties
 */
const defaultProps = {
    version: "v0.21.2"
};

export class OlmAddOn implements ClusterAddOn {
    readonly props: OlmAddOnProps;
    readonly manifestUrls: string[];

    constructor(props?: OlmAddOnProps) {
        this.props = { ...defaultProps, ...props };
        this.manifestUrls = [
            OLMDownloadURL + this.props.version + "/crds.yaml",
            OLMDownloadURL + this.props.version + "/olm.yaml"
        ];
    }

    deploy(clusterInfo: ClusterInfo): void | Promise<Construct> {
        let previousResource: Construct;
        const resources: Construct[] = [];

        /* eslint-disable */
        const request = require('sync-request');
        const kubectlProvider = new KubectlProvider(clusterInfo);

        this.manifestUrls!.map((manifestUrl, urlIndex) => {
            const response = request('GET', manifestUrl);
            // workaround: KubectlProvider is based on Lambda, which fails if the manifests are too large, so we:
            // 1. break the YAMLs
            // 2. remove descriptions
            const doc: string = response.getBody().toString();
            const trimmedDoc = doc.replace(/description:.*[a-zA-Z0-9].*\n/g, 'description: removed\n');
            const manifests = trimmedDoc.split("---").filter(e => e.length > 0).map(e => loadYaml(e));

            const batchResources = manifests.map((manifest, docIndex) => {
                const manifestDeployment: ManifestDeployment = {
                    name: "olmIdx" + urlIndex + docIndex,
                    namespace: "olm",
                    manifest: [manifest],
                    values: {}
                };

                const resource = kubectlProvider.addManifest(manifestDeployment);

                if (previousResource != undefined) {
                    resource.node.addDependency(previousResource);
                }
                previousResource = resource;
                return resource;
            });

            resources.push(...batchResources);
        });

        assert(resources.length > 0, "No OLM manifest found");

        return Promise.resolve(resources.at(-1)!);
    }
}
