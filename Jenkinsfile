pipeline {
    agent any

    environment {
        DOCKER_PATH = '"C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe"'
        IMAGE_NAME  = 'sudaisk19/orangehrm-e2e'
        IMAGE_TAG   = "${env.BUILD_NUMBER}"
    }

    options {
        timestamps()
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build Docker Image') {
            steps {
                bat "${DOCKER_PATH} build -t ${IMAGE_NAME}:${IMAGE_TAG} -t ${IMAGE_NAME}:latest ."
            }
        }

        stage('Run Tests') {
            steps {
                script {
                    bat "if exist playwright-report rmdir /s /q playwright-report"
                    bat "if exist allure-results rmdir /s /q allure-results"
                    bat "${DOCKER_PATH} rm -f orangehrm-test-${BUILD_NUMBER} 2>nul || exit 0"

                    def testExit = bat(
                        returnStatus: true,
                        script: "${DOCKER_PATH} run --name orangehrm-test-${BUILD_NUMBER} --ipc=host ${IMAGE_NAME}:${IMAGE_TAG}"
                    )
                    env.TEST_EXIT_CODE = testExit.toString()
                }
            }
        }

        stage('Copy Reports from Container') {
            steps {
                bat "${DOCKER_PATH} cp orangehrm-test-${BUILD_NUMBER}:/app/playwright-report ./playwright-report || exit 0"
                bat "${DOCKER_PATH} cp orangehrm-test-${BUILD_NUMBER}:/app/allure-results ./allure-results || exit 0"
                bat "${DOCKER_PATH} rm -f orangehrm-test-${BUILD_NUMBER} || exit 0"
            }
        }

        stage('Publish Reports') {
            steps {
                publishHTML(target: [
                    reportDir            : 'playwright-report',
                    reportFiles          : 'index.html',
                    reportName           : 'Playwright HTML Report',
                    keepAll              : true,
                    alwaysLinkToLastBuild: true,
                    allowMissing         : true
                ])

                allure([
                    includeProperties: false,
                    jdk              : '',
                    results          : [[path: 'allure-results']]
                ])
            }
        }

        stage('Push to Docker Hub') {
            when {
                expression { env.TEST_EXIT_CODE == '0' }
            }
            steps {
                withCredentials([usernamePassword(
                    credentialsId   : 'dockerhub-creds',
                    usernameVariable: 'DH_USER',
                    passwordVariable: 'DH_PASS'
                )]) {
                    bat """
                        echo %DH_PASS% | ${DOCKER_PATH} login -u %DH_USER% --password-stdin
                        ${DOCKER_PATH} push ${IMAGE_NAME}:${IMAGE_TAG}
                        ${DOCKER_PATH} push ${IMAGE_NAME}:latest
                        ${DOCKER_PATH} logout
                    """
                }
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'playwright-report/**, allure-results/**, logs/**', allowEmptyArchive: true
        }
        unstable {
            echo "Tests had failures. Historically flaky: TC006, TC011, TC024. Check the report before assuming regression."
        }
        cleanup {
            bat "${DOCKER_PATH} rm -f orangehrm-test-${BUILD_NUMBER} 2>nul || exit /b 0"
        }
    }
}