package com.novasoft.psicoapp.model; import jakarta.persistence.*;
@Entity public class Question{ @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id; @Column(length=1500) public String text; public int score=10; public int orderIndex=1; @ManyToOne public Scenario scenario; }
