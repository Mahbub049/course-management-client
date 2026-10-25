package com.bubt.marksportal;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(ExamDutyNotifierPlugin.class);
        super.onCreate(savedInstanceState);
    }}
